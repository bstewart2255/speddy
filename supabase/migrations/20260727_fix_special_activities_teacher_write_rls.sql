-- SPE-335: teachers have never been able to create a special activity.
--
-- `special_activities` originally identified the owning classroom teacher by
-- stuffing the teacher's id into `provider_id`. The INSERT/UPDATE/DELETE
-- policies were written against that convention:
--
--     provider_id IN (SELECT id FROM teachers WHERE account_id = auth.uid())
--     OR provider_id = auth.uid()
--     OR <site admin for the row's school>
--
-- `20251112_migrate_special_activities_to_teacher_id.sql` moved the app to a
-- dedicated `teacher_id` column, and the teacher portal has written
-- `{ teacher_id, created_by_role: 'teacher', provider_id: null }` ever since
-- (lib/supabase/queries/teacher-portal.ts). The write policies never followed.
-- With `provider_id = NULL` no branch can pass, so every teacher INSERT was
-- rejected — 0 of the 206 production rows have `created_by_role = 'teacher'`
-- (verified 2026-07-25). Soft-delete (an UPDATE setting `deleted_at`) was
-- rejected for the same reason.
--
-- SELECT was never affected — it has its own school-scoped branches — which is
-- why the page loads fine and only writes fail.
--
-- Fix: add a teacher branch to the three write policies. Existing
-- provider/site-admin branches are carried over verbatim.
--
-- The teacher branch requires all of:
--   * `created_by_role = 'teacher'` and `created_by_id` is the caller, and
--   * the row's `teacher_id` is one of the caller's own teacher records, and
--   * that teacher record is at the row's school.
--
-- `teacher_id` alone would be too wide: it marks WHOSE CLASS the activity
-- belongs to, not who created it, so a provider-created activity for Ms. Lee's
-- class carries `teacher_id = <Ms. Lee>`. The teacher portal already treats
-- those as read-only ("Only activities you created can be deleted",
-- app/(dashboard)/dashboard/teacher/special-activities/page.tsx), and the query
-- layer filters on `created_by_id`/`created_by_role` for every teacher write.
-- Matching the policy to that contract fixes creation without granting teachers
-- anything the UI does not already offer them.
--
-- The school correlation matters because nothing else in this branch pins the
-- row to a site: without it a teacher could file an activity into another
-- school's schedule using their own teacher record. The site-admin branch
-- beside it is already school-scoped; this keeps the teacher branch consistent.
-- Every login-linked `teachers` row in production carries a `school_id`
-- (59/59, verified 2026-07-27), so this refuses nothing that works today.
--
-- Not addressed here, and NOT introduced here: `WITH CHECK` is a disjunction,
-- so any caller who sets `provider_id` to their own uid in the same statement
-- satisfies the second branch and can then rewrite the row's other columns —
-- including `teacher_id` and the `created_by_*` authorship pair. That is
-- pre-existing behaviour of the `provider_id = auth.uid()` branch and is
-- reachable today by every provider for their own rows; this migration extends
-- the same looseness to teacher-authored rows. Closing it needs a BEFORE UPDATE
-- trigger (RLS gates rows, not columns — see the SPE-332 precedent in
-- 20260724_fix_profiles_update_rls_recursion.sql) and is tracked separately, so
-- that it lands as one deliberate change across all writers rather than as a
-- silent asymmetry between them.

drop policy if exists special_activities_insert on public.special_activities;

create policy special_activities_insert on public.special_activities
  for insert
  to authenticated
  with check (
    provider_id in (
      select teachers.id from public.teachers
      where teachers.account_id = (select auth.uid())
    )
    or provider_id = (select auth.uid())
    or (
      created_by_role = 'teacher'
      and created_by_id = (select auth.uid())
      and exists (
        select 1 from public.teachers t
        where t.id = special_activities.teacher_id
          and t.account_id = (select auth.uid())
          and (t.school_id)::text = (special_activities.school_id)::text
      )
    )
    or exists (
      select 1 from public.admin_permissions ap
      where ap.admin_id = (select auth.uid())
        and ap.role = 'site_admin'
        and (ap.school_id)::text = (special_activities.school_id)::text
    )
  );

drop policy if exists special_activities_update on public.special_activities;

create policy special_activities_update on public.special_activities
  for update
  to authenticated
  using (
    provider_id in (
      select teachers.id from public.teachers
      where teachers.account_id = (select auth.uid())
    )
    or provider_id = (select auth.uid())
    or (
      created_by_role = 'teacher'
      and created_by_id = (select auth.uid())
      and exists (
        select 1 from public.teachers t
        where t.id = special_activities.teacher_id
          and t.account_id = (select auth.uid())
          and (t.school_id)::text = (special_activities.school_id)::text
      )
    )
    or exists (
      select 1 from public.admin_permissions ap
      where ap.admin_id = (select auth.uid())
        and ap.role = 'site_admin'
        and (ap.school_id)::text = (special_activities.school_id)::text
    )
  )
  with check (
    provider_id in (
      select teachers.id from public.teachers
      where teachers.account_id = (select auth.uid())
    )
    or provider_id = (select auth.uid())
    or (
      created_by_role = 'teacher'
      and created_by_id = (select auth.uid())
      and exists (
        select 1 from public.teachers t
        where t.id = special_activities.teacher_id
          and t.account_id = (select auth.uid())
          and (t.school_id)::text = (special_activities.school_id)::text
      )
    )
    or exists (
      select 1 from public.admin_permissions ap
      where ap.admin_id = (select auth.uid())
        and ap.role = 'site_admin'
        and (ap.school_id)::text = (special_activities.school_id)::text
    )
  );

drop policy if exists special_activities_delete on public.special_activities;

create policy special_activities_delete on public.special_activities
  for delete
  to authenticated
  using (
    provider_id in (
      select teachers.id from public.teachers
      where teachers.account_id = (select auth.uid())
    )
    or provider_id = (select auth.uid())
    or (
      created_by_role = 'teacher'
      and created_by_id = (select auth.uid())
      and exists (
        select 1 from public.teachers t
        where t.id = special_activities.teacher_id
          and t.account_id = (select auth.uid())
          and (t.school_id)::text = (special_activities.school_id)::text
      )
    )
    or exists (
      select 1 from public.admin_permissions ap
      where ap.admin_id = (select auth.uid())
        and ap.role = 'site_admin'
        and (ap.school_id)::text = (special_activities.school_id)::text
    )
  );
