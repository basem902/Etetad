-- =============================================
-- 12_phase9.sql — Phase 9 (Vendors)
-- =============================================
-- يطبَّق بعد 11_phase8.sql.
-- مرحلة بسيطة (CRUD على vendors)، لكن نُطبِّق وقائياً درس Phase 8 round 5:
-- tenant column immutability — building_id لا يتغيّر بعد الإنشاء.
-- =============================================

-- =============================================
-- (1) Tenant lock on vendors (preventive — Phase 8 round 5 lesson)
-- =============================================
-- vendors_manage تَسمح للـ admin/treasurer/committee بالتحديث، لكن لا تَمنع
-- تغيير building_id. عضو في عمارتين يستطيع نقل المورد بينهما، فيكسر:
--   1) tenant isolation
--   2) FK consistency (expenses.vendor_id بـ composite (vendor_id, building_id))
-- بدون هذا الـ trigger، الـ FK المُركَّب من Phase 1 سيَفشل عند UPDATE،
-- لكن نَفضِّل رسالة خطأ صريحة من الـ trigger بدلاً من FK violation غامض.
-- =============================================

create or replace function public.vendors_validate_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on vendors'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_vendors_validate_update on public.vendors;

create trigger trg_vendors_validate_update
  before update on public.vendors
  for each row
  execute function public.vendors_validate_update();

-- End 12_phase9.sql
