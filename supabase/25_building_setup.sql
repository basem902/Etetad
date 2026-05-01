-- ============================================================
-- 25_building_setup.sql — Onboarding wizard backend
-- ============================================================
-- يُطَبَّق بَعد 24_skip_receipt.sql.
--
-- بَعد ما super_admin يَعتَمِد طَلب الاشتراك، الـ admin يَدخُل ويَجِد عمارة فارغة
-- بدون شُقَق ولا أَدوار. هذي ال migration تُضيف:
--   1. floors_count على buildings (عَدَد الأَدوار)
--   2. setup_completed_at على buildings (علامة "أَنهى الـ admin الإعداد الأوَّلي؟")
--   3. RPC complete_building_setup — يَحفَظ البيانات + يُنشئ شُقَق فارغة دُفعة وحدة
--
-- الـ RPC يُنشئ apartments numbered 1..N بحَيث الدور يُوَزَّع بالتَساوي على
-- الأَدوار. مَثلاً 50 شَقة + 5 أدوار → 10 شُقَق لكُل دور (شُقَق 1-10 → دور 1،
-- شُقَق 11-20 → دور 2، ...). الـ admin يَقدِر يُعَدِّل لاحقاً عَبر /apartments.
-- ============================================================

begin;

-- (1) Schema: floors_count
alter table public.buildings
  add column if not exists floors_count int not null default 0;

do $$ begin
  alter table public.buildings
    add constraint chk_floors_count
    check (floors_count >= 0 and floors_count <= 200);
exception when duplicate_object then null;
end $$;

-- (2) Schema: setup_completed_at (nullable; null = wizard لِسَّة ما اكتَمَل)
alter table public.buildings
  add column if not exists setup_completed_at timestamptz;

-- (3) RPC complete_building_setup
-- ============================================================
-- inputs:
--   p_building_id     — العمارة المُستَهدَفة (admin gating داخل الـ RPC)
--   p_name            — اسم العمارة (يُحَدَّث لو الـ admin غَيَّره في الـ wizard)
--   p_floors_count    — عَدَد الأَدوار
--   p_total_apartments— عَدَد الشُقَق (يُنشَأ بهذا العَدَد كَصُفوف فارغة)
--   p_elevators_count — عَدَد المَصاعد
--
-- behavior:
--   - إذا setup_completed_at مُسَنَد بالفِعل → 'setup already completed'
--   - تَحديث الأَعمدة الأَربَعة + setup_completed_at = now()
--   - INSERT شُقَق 1..N (status='vacant', monthly_fee=0)
--   - الدور = ceil(i * floors / apartments) — تَوزيع مُتَساوي
--   - لو الـ admin أَنشأ شُقَق يَدوياً قَبل الـ wizard، نُعالج DUPLICATE
--     بـ on conflict do nothing.
-- ============================================================
create or replace function public.complete_building_setup(
  p_building_id uuid,
  p_name text,
  p_floors_count int,
  p_total_apartments int,
  p_elevators_count int
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller uuid := auth.uid();
  v_building record;
  i int;
  v_floor int;
begin
  if v_caller is null then
    raise exception 'authentication required' using errcode = 'P0003';
  end if;

  -- Admin gate
  if not public.user_has_role(
    p_building_id, array['admin']::public.membership_role[], v_caller
  ) then
    raise exception 'Access denied: building admin only' using errcode = 'P0003';
  end if;

  -- Lock the building row to avoid concurrent setup races
  select * from public.buildings
  into v_building
  where id = p_building_id
  for update;

  if not found then
    raise exception 'building not found' using errcode = 'P0002';
  end if;

  -- Idempotency: if already completed, allow re-update of metadata only
  -- (so the wizard can be re-opened to fix typos), but do NOT re-create
  -- apartments — that would duplicate-key on (building_id, number).
  if v_building.setup_completed_at is not null then
    raise exception 'setup already completed' using errcode = 'P0003';
  end if;

  -- Validation
  if p_name is null or length(p_name) < 2 or length(p_name) > 200 then
    raise exception 'invalid building name' using errcode = 'check_violation';
  end if;
  if p_floors_count < 1 or p_floors_count > 200 then
    raise exception 'floors_count must be 1..200' using errcode = 'check_violation';
  end if;
  if p_total_apartments < 1 or p_total_apartments > 10000 then
    raise exception 'total_apartments must be 1..10000' using errcode = 'check_violation';
  end if;
  if p_elevators_count < 0 or p_elevators_count > 100 then
    raise exception 'elevators_count must be 0..100' using errcode = 'check_violation';
  end if;

  -- (a) Update building metadata + mark setup completed
  update public.buildings
  set name = p_name,
      floors_count = p_floors_count,
      total_apartments = p_total_apartments,
      elevators_count = p_elevators_count,
      setup_completed_at = now(),
      updated_at = now()
  where id = p_building_id;

  -- (b) Auto-create apartment rows numbered 1..N with floor distribution
  -- ceil(i * floors / total) → 1..floors_count
  for i in 1..p_total_apartments loop
    v_floor := ceil((i::numeric * p_floors_count) / p_total_apartments)::int;
    if v_floor < 1 then v_floor := 1; end if;
    if v_floor > p_floors_count then v_floor := p_floors_count; end if;

    insert into public.apartments (
      building_id, number, floor, monthly_fee, status
    ) values (
      p_building_id, i::text, v_floor, 0, 'vacant'
    )
    on conflict (building_id, number) do nothing;
  end loop;
end;
$$;

revoke execute on function public.complete_building_setup(
  uuid, text, int, int, int
) from public;
grant execute on function public.complete_building_setup(
  uuid, text, int, int, int
) to authenticated;

commit;
