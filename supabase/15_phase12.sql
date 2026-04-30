-- =============================================
-- 15_phase12.sql — Phase 12 (Financial Reports)
-- =============================================
-- يطبَّق بعد 14_phase11.sql.
-- يضيف SECURITY DEFINER RPCs للـ aggregations المالية. كل دالة:
--   - تَفحص أن المستخدم admin/treasurer/committee في العمارة (لا resident)
--   - تُجري الـ aggregation داخل DB (تجنّب N+1 + ضغط شبكة)
--   - تُرجع counts/sums بدون كشف raw rows
--
-- الفلسفة (per PLAN §12):
--   الدخل   = SUM(payments.amount) WHERE status='approved' AND period_month in range
--   المصروف = SUM(expenses.amount)  WHERE status='paid'      AND expense_date in range
--   الرصيد  = الدخل - المصروف
--   المتأخرات = شقق نشطة لم تَدفع للشهر المعني
-- =============================================

-- =============================================
-- (1) Monthly summary RPC
-- =============================================
-- p_period: YYYY-MM-01 (first of the month)
-- Returns one row of aggregated stats.
-- =============================================

create or replace function public.get_monthly_financial_summary(
  p_building_id uuid,
  p_period date
) returns table (
  income numeric,
  expense numeric,
  balance numeric,
  income_count bigint,
  expense_count bigint,
  outstanding_apartments_count bigint,
  outstanding_apartments_total numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_period_start date := date_trunc('month', p_period)::date;
  v_period_end date := (date_trunc('month', p_period) + interval '1 month')::date;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    p_building_id, array['admin', 'treasurer', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied: reports are admin/treasurer/committee only'
      using errcode = 'P0003';
  end if;

  return query
  with
  income_agg as (
    select
      coalesce(sum(amount), 0)::numeric as total,
      count(*)::bigint as cnt
    from public.payments
    where building_id = p_building_id
      and status = 'approved'
      and period_month >= v_period_start
      and period_month <  v_period_end
  ),
  expense_agg as (
    select
      coalesce(sum(amount), 0)::numeric as total,
      count(*)::bigint as cnt
    from public.expenses
    where building_id = p_building_id
      and status = 'paid'
      and expense_date >= v_period_start
      and expense_date <  v_period_end
  ),
  -- Eligible apartments = those with monthly_fee > 0.
  -- An apartment is "outstanding" when it has NO approved payment for the
  -- given period_month.
  outstanding_agg as (
    select
      count(*)::bigint as cnt,
      coalesce(sum(a.monthly_fee), 0)::numeric as total
    from public.apartments a
    where a.building_id = p_building_id
      and coalesce(a.monthly_fee, 0) > 0
      and not exists (
        select 1 from public.payments p
        where p.building_id = p_building_id
          and p.apartment_id = a.id
          and p.status = 'approved'
          and p.period_month = v_period_start
      )
  )
  select
    income_agg.total,
    expense_agg.total,
    income_agg.total - expense_agg.total,
    income_agg.cnt,
    expense_agg.cnt,
    outstanding_agg.cnt,
    outstanding_agg.total
  from income_agg, expense_agg, outstanding_agg;
end;
$$;

grant execute on function public.get_monthly_financial_summary(uuid, date) to authenticated;

-- =============================================
-- (2) Expense category breakdown for a period
-- =============================================
-- Returns category + total + count, ordered by total desc.
-- =============================================

create or replace function public.get_expense_category_breakdown(
  p_building_id uuid,
  p_period_start date,
  p_period_end date
) returns table (
  category text,
  total numeric,
  count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    p_building_id, array['admin', 'treasurer', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied' using errcode = 'P0003';
  end if;

  return query
    select
      coalesce(e.category, 'بدون تصنيف') as category,
      sum(e.amount)::numeric as total,
      count(*)::bigint as count
    from public.expenses e
    where e.building_id = p_building_id
      and e.status = 'paid'
      and e.expense_date >= p_period_start
      and e.expense_date <  p_period_end
    group by coalesce(e.category, 'بدون تصنيف')
    order by total desc;
end;
$$;

grant execute on function public.get_expense_category_breakdown(uuid, date, date) to authenticated;

-- =============================================
-- (3) Yearly month-by-month totals
-- =============================================
-- Returns one row per month in [year-01, year-12] with income + expense.
-- Used for the yearly bar chart.
-- =============================================

-- Codex round 1 P2: include income_count + expense_count per month so the
-- yearly view can show transaction counts (PLAN §12 acceptance criterion).
create or replace function public.get_yearly_monthly_totals(
  p_building_id uuid,
  p_year int
) returns table (
  month_start date,
  income numeric,
  expense numeric,
  income_count bigint,
  expense_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_year_start date := make_date(p_year, 1, 1);
  v_year_end date   := make_date(p_year + 1, 1, 1);
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    p_building_id, array['admin', 'treasurer', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied' using errcode = 'P0003';
  end if;

  -- Generate all 12 months as a left side; outer-join the aggregations.
  return query
  with months as (
    select generate_series(v_year_start, v_year_end - interval '1 day', interval '1 month')::date as ms
  ),
  income_per_month as (
    select date_trunc('month', period_month)::date as ms,
           sum(amount)::numeric as total,
           count(*)::bigint as cnt
    from public.payments
    where building_id = p_building_id
      and status = 'approved'
      and period_month >= v_year_start
      and period_month <  v_year_end
    group by date_trunc('month', period_month)::date
  ),
  expense_per_month as (
    select date_trunc('month', expense_date)::date as ms,
           sum(amount)::numeric as total,
           count(*)::bigint as cnt
    from public.expenses
    where building_id = p_building_id
      and status = 'paid'
      and expense_date >= v_year_start
      and expense_date <  v_year_end
    group by date_trunc('month', expense_date)::date
  )
  select
    months.ms,
    coalesce(income_per_month.total, 0)::numeric,
    coalesce(expense_per_month.total, 0)::numeric,
    coalesce(income_per_month.cnt, 0)::bigint,
    coalesce(expense_per_month.cnt, 0)::bigint
  from months
  left join income_per_month on income_per_month.ms = months.ms
  left join expense_per_month on expense_per_month.ms = months.ms
  order by months.ms;
end;
$$;

grant execute on function public.get_yearly_monthly_totals(uuid, int) to authenticated;

-- =============================================
-- (4) Custom date-range summary
-- =============================================
-- For PLAN's "اختيار فترة مخصص". Period is [from, to) inclusive of from,
-- exclusive of (to + 1 day) — so a day-precision range works correctly.
-- =============================================

create or replace function public.get_range_financial_summary(
  p_building_id uuid,
  p_from date,
  p_to date
) returns table (
  income numeric,
  expense numeric,
  balance numeric,
  income_count bigint,
  expense_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_to_excl date := p_to + interval '1 day';
  -- Codex round 1 P2: payments are filtered by period_month (the dues period),
  -- mirroring monthly/yearly. Round month boundaries so day-precision range
  -- inputs still capture all payments for any month that intersects.
  v_period_from date := date_trunc('month', p_from)::date;
  v_period_to_excl date := (date_trunc('month', p_to) + interval '1 month')::date;
begin
  if v_caller is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not (public.is_super_admin() or public.user_has_role(
    p_building_id, array['admin', 'treasurer', 'committee']::public.membership_role[]
  )) then
    raise exception 'Access denied' using errcode = 'P0003';
  end if;

  if p_from > p_to then
    raise exception 'Invalid range: from > to' using errcode = 'P0008';
  end if;

  return query
  with
  income_agg as (
    select
      coalesce(sum(amount), 0)::numeric as total,
      count(*)::bigint as cnt
    from public.payments
    where building_id = p_building_id
      and status = 'approved'
      -- period_month (not payment_date) so early/late physical payments
      -- still aggregate by their dues period — consistent with monthly view.
      and period_month >= v_period_from
      and period_month <  v_period_to_excl
  ),
  expense_agg as (
    select
      coalesce(sum(amount), 0)::numeric as total,
      count(*)::bigint as cnt
    from public.expenses
    where building_id = p_building_id
      and status = 'paid'
      and expense_date >= p_from
      and expense_date <  v_to_excl
  )
  select
    income_agg.total,
    expense_agg.total,
    income_agg.total - expense_agg.total,
    income_agg.cnt,
    expense_agg.cnt
  from income_agg, expense_agg;
end;
$$;

grant execute on function public.get_range_financial_summary(uuid, date, date) to authenticated;

-- End 15_phase12.sql
