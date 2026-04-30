-- =============================================
-- 14_phase11.sql — Phase 11 (Documents + Audit Logs)
-- =============================================
-- يطبَّق بعد 13_phase10.sql.
-- يطبّق دروس Codex وقائياً:
--   - Documents: tenant lock + audit-field immutability + INSERT ownership
--   - Documents storage: orphan-only DELETE policy (Phase 6 P2.2 lesson)
--   - Audit logs: defensive trigger (immutable beyond missing policies)
-- =============================================

-- =============================================
-- (1) Documents — tenant + audit lock trigger
-- =============================================

create or replace function public.documents_validate_update()
returns trigger
language plpgsql
as $$
begin
  if NEW.building_id is distinct from OLD.building_id then
    raise exception 'building_id is immutable on documents'
      using errcode = 'check_violation';
  end if;
  if NEW.uploaded_by is distinct from OLD.uploaded_by then
    raise exception 'uploaded_by is immutable on documents (audit field)'
      using errcode = 'check_violation';
  end if;
  if NEW.file_url is distinct from OLD.file_url then
    raise exception 'file_url is immutable on documents (re-upload as new doc)'
      using errcode = 'check_violation';
  end if;
  if NEW.file_size is distinct from OLD.file_size then
    raise exception 'file_size is immutable on documents'
      using errcode = 'check_violation';
  end if;
  if NEW.created_at is distinct from OLD.created_at then
    raise exception 'created_at is immutable on documents'
      using errcode = 'check_violation';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_documents_validate_update on public.documents;
create trigger trg_documents_validate_update
  before update on public.documents
  for each row
  execute function public.documents_validate_update();

-- =============================================
-- (1b) file_url path must match building_id (Codex round 2 P1)
-- =============================================
-- Defense-in-depth alongside the storage SELECT path check. Forbids INSERT
-- of a documents row whose file_url points outside the row's own building.
-- INSERT-only because UPDATE is already covered by trg_documents_validate_update
-- (file_url + building_id are both immutable post-INSERT).
-- =============================================

create or replace function public.documents_validate_file_url()
returns trigger
language plpgsql
as $$
begin
  if NEW.file_url is null or length(trim(NEW.file_url)) = 0 then
    raise exception 'file_url is required'
      using errcode = 'check_violation';
  end if;

  if NEW.file_url not like (NEW.building_id::text || '/documents/%') then
    raise exception
      'file_url must start with {building_id}/documents/ (got: %, expected prefix: %)',
      NEW.file_url, NEW.building_id::text || '/documents/'
      using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_documents_validate_file_url on public.documents;
create trigger trg_documents_validate_file_url
  before insert on public.documents
  for each row
  execute function public.documents_validate_file_url();

-- =============================================
-- (2) Documents INSERT lock — uploaded_by = auth.uid() (Phase 8 round 6 lesson)
-- =============================================
-- Replace documents_manage (FOR ALL) with split policies so we can apply
-- ownership checks to INSERT specifically.
-- =============================================

drop policy if exists "documents_manage" on public.documents;

create policy "documents_insert_admin_committee"
on public.documents for insert
to authenticated
with check (
  (
    public.user_has_role(
      building_id,
      array['admin', 'treasurer', 'committee']::public.membership_role[]
    )
    or public.is_super_admin()
  )
  -- Ownership: uploaded_by must equal the caller (no impersonation).
  -- Super-admins are allowed to set arbitrary uploaded_by (rare admin flows).
  and (
    uploaded_by = auth.uid()
    or public.is_super_admin()
  )
);

create policy "documents_update_admin_committee"
on public.documents for update
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
)
with check (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

create policy "documents_delete_admin_committee"
on public.documents for delete
to authenticated
using (
  public.user_has_role(
    building_id,
    array['admin', 'treasurer', 'committee']::public.membership_role[]
  )
  or public.is_super_admin()
);

-- =============================================
-- (3) Documents storage SELECT — row-scoped (Codex round 1 P1)
-- =============================================
-- Old policy `documents_select_members` was path-based: any building member
-- could read any file in the building's folder, ignoring is_public AND not
-- joining to the documents row. So a "private" document (is_public=false,
-- meant for managers only) was readable by any resident if they knew the path.
--
-- Replace with a row-scoped policy that mirrors `documents_select_members`
-- on public.documents:
--   - super_admin: always
--   - building member: only when is_public=true
--   - admin/treasurer/committee: always (private docs included)
-- =============================================

drop policy if exists "documents_select_members" on storage.objects;

create policy "documents_select_relevant"
on storage.objects for select
to authenticated
using (
  bucket_id = 'documents'
  and (
    public.is_super_admin()
    or exists (
      select 1 from public.documents d
      where d.file_url = storage.objects.name
        -- Codex round 2 P1: path tenant must equal row tenant. Without this,
        -- a manager in building A could create a doc row pointing to B's path
        -- and grant A's residents read access to B's file.
        and ((storage.foldername(storage.objects.name))[1])::uuid = d.building_id
        and (
          (d.is_public = true and public.is_building_member(d.building_id))
          or public.user_has_role(
            d.building_id,
            array['admin', 'treasurer', 'committee']::public.membership_role[]
          )
        )
    )
  )
);

-- =============================================
-- (4) Documents storage DELETE — owner OR building manager (Codex round 1 P2)
-- =============================================
-- Old policy `documents_delete_own_orphan` only allowed owner = auth.uid().
-- Problem: when admin deletes someone else's document, the row is removed
-- but the storage cleanup (best-effort in the action) silently fails because
-- admin isn't the file owner. The file becomes an orphan with no owner-side
-- recourse.
--
-- Extended policy: orphan-only DELETE for:
--   - File owner (original uploader, e.g. for failed-insert rollback)
--   - admin/treasurer/committee of the file's building (post-row-delete cleanup)
--   - super_admin
-- The orphan check (no documents.file_url references the file) preserves the
-- "linked documents are immutable" invariant — managers can't delete files
-- without first deleting the row.
-- =============================================

create policy "documents_delete_own_or_manager_orphan"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'documents'
  and not exists (
    select 1 from public.documents where file_url = storage.objects.name
  )
  and (
    owner = auth.uid()
    or public.is_super_admin()
    or public.user_has_role(
      ((storage.foldername(name))[1])::uuid,
      array['admin', 'treasurer', 'committee']::public.membership_role[]
    )
  )
);

-- =============================================
-- (4) Audit logs immutability — defensive trigger
-- =============================================
-- The audit_logs table has no UPDATE/DELETE policies, so authenticated users
-- can't modify it. But this defensive trigger raises a clear exception if any
-- privileged context (service_role, future RPC, etc.) tries to mutate audit
-- entries — preserving the integrity of the audit trail.
-- =============================================

create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs are immutable (% is forbidden)', TG_OP
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists trg_audit_logs_no_update on public.audit_logs;
create trigger trg_audit_logs_no_update
  before update on public.audit_logs
  for each row
  execute function public.audit_logs_immutable();

drop trigger if exists trg_audit_logs_no_delete on public.audit_logs;
create trigger trg_audit_logs_no_delete
  before delete on public.audit_logs
  for each row
  execute function public.audit_logs_immutable();

-- End 14_phase11.sql
