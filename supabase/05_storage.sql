-- =============================================
-- 05_storage.sql — Storage Buckets + Policies
-- =============================================
-- Path convention: {building_id}/{...}
-- For avatars: {user_id}/{...} (per-user)
-- =============================================

-- =============================================
-- Buckets
-- =============================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('receipts',    'receipts',    false, 5242880,  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('invoices',    'invoices',    false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('maintenance', 'maintenance', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('documents',   'documents',   false, 26214400, array['application/pdf', 'image/jpeg', 'image/png',
                                                        'application/msword',
                                                        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                                        'application/vnd.ms-excel',
                                                        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('avatars',     'avatars',     true,  2097152,  array['image/jpeg', 'image/png', 'image/webp']),
  ('logos',       'logos',       true,  2097152,  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do nothing;

-- =============================================
-- receipts (private) — building members can read & insert
-- Path: {building_id}/payments/{payment_id}/{file}
-- =============================================
create policy "receipts_select_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'receipts'
  and (
    public.is_building_member(((storage.foldername(name))[1])::uuid)
    or public.is_super_admin()
  )
);

create policy "receipts_insert_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'receipts'
  and public.is_building_member(((storage.foldername(name))[1])::uuid)
);

-- No UPDATE/DELETE on receipts (financial proof — immutable)

-- =============================================
-- invoices (private) — only admin/treasurer/committee
-- Path: {building_id}/expenses/{expense_id}/{file}
-- =============================================
create policy "invoices_select_treasurer_admin_committee"
on storage.objects for select
to authenticated
using (
  bucket_id = 'invoices'
  and (
    public.user_has_role(
      ((storage.foldername(name))[1])::uuid,
      array['admin', 'treasurer', 'committee']::public.membership_role[]
    )
    or public.is_super_admin()
  )
);

create policy "invoices_insert_treasurer_admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'invoices'
  and public.user_has_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin', 'treasurer']::public.membership_role[]
  )
);

-- =============================================
-- maintenance (private) — building members
-- Path: {building_id}/maintenance/{request_id}/{file}
-- =============================================
create policy "maintenance_select_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'maintenance'
  and (
    public.is_building_member(((storage.foldername(name))[1])::uuid)
    or public.is_super_admin()
  )
);

create policy "maintenance_insert_members"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'maintenance'
  and public.is_building_member(((storage.foldername(name))[1])::uuid)
);

-- =============================================
-- documents (private) — building members read; admin/treasurer/committee write
-- Path: {building_id}/documents/{...}
-- =============================================
create policy "documents_select_members"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    public.is_building_member(((storage.foldername(name))[1])::uuid)
    or public.is_super_admin()
  )
);

create policy "documents_insert_admin_committee"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'documents'
  and public.user_has_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
);

-- =============================================
-- avatars (public) — user manages own avatar
-- Path: {user_id}/{file}
-- =============================================
create policy "avatars_select_public"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "avatars_insert_self"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "avatars_update_self"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

create policy "avatars_delete_self"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- =============================================
-- logos (public) — building admin manages
-- Path: {building_id}/{file}
-- =============================================
create policy "logos_select_public"
on storage.objects for select
using (bucket_id = 'logos');

create policy "logos_insert_admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'logos'
  and public.user_has_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin']::public.membership_role[]
  )
);

create policy "logos_update_admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'logos'
  and public.user_has_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin']::public.membership_role[]
  )
);

create policy "logos_delete_admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'logos'
  and public.user_has_role(
    ((storage.foldername(name))[1])::uuid,
    array['admin']::public.membership_role[]
  )
);

-- End 05_storage.sql
