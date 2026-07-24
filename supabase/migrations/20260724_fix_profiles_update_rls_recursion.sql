-- SPE-332: profiles_update RLS was recursive — NO user could update their own row.
--
-- The policy's WITH CHECK compared the incoming row's immutable columns against
-- the stored ones by querying `profiles` from inside its own policy:
--
--     AND role = (SELECT p.role FROM profiles p WHERE p.id = (select auth.uid()))
--     AND NOT (school_id::text IS DISTINCT FROM (SELECT p.school_id FROM profiles p ...))
--     ...
--
-- Postgres re-applies the policy to those subqueries, so every UPDATE failed with
-- `42P17 infinite recursion detected in policy for relation "profiles"` — for all
-- users, all columns. Introduced in 20251230_fix_profiles_update_rls_security.sql
-- and carried forward verbatim into 20260107_fix_rls_performance_warnings.sql.
--
-- It failed CLOSED (no escalation was possible), but it silently broke every
-- self-serve write: the SPE-320 daily-schedule toggle, the settings
-- "Request Password Reset" button, and dismissing the onboarding banners.
--
-- The intent was right and is preserved: a user may edit their own profile but
-- must not be able to change their own role, speddy-admin flag, school or
-- district. RLS policies cannot reference OLD, which is why the original reached
-- for a subquery. A BEFORE UPDATE trigger CAN see OLD and NEW, so the immutability
-- rule moves there and the policy goes back to a plain identity check.

-- 1. Non-recursive policy. Same three branches as before (self, service_role,
--    site admin for the row's school); nothing here reads `profiles`.
drop policy if exists profiles_update on public.profiles;

create policy profiles_update on public.profiles
  for update
  to authenticated
  using (
    (select auth.uid()) = id
    or (select auth.role()) = 'service_role'
    or exists (
      select 1
      from public.admin_permissions ap
      where ap.admin_id = (select auth.uid())
        and ap.role = 'site_admin'
        and (ap.school_id)::text = (profiles.school_id)::text
    )
  )
  with check (
    (select auth.uid()) = id
    or (select auth.role()) = 'service_role'
    or exists (
      select 1
      from public.admin_permissions ap
      where ap.admin_id = (select auth.uid())
        and ap.role = 'site_admin'
        and (ap.school_id)::text = (profiles.school_id)::text
    )
  );

-- 2. The immutability rule the policy was trying to express, where OLD is
--    actually available.
create or replace function public.profiles_guard_immutable_columns()
returns trigger
language plpgsql
security invoker
-- Empty search_path per the SPE-10 hardening; every reference below is schema
-- qualified so nothing resolves off an ambient path (cf. SPE-281, where a locked
-- search_path broke an unqualified similarity() call).
set search_path = ''
as $$
begin
  -- Server-side admin flows run as service_role and are the ONLY legitimate way
  -- these columns change (admin account creation, provider transfers). Every such
  -- route already uses the service client, and no browser/user-session code path
  -- writes them at all — `is_speddy_admin` is never written by app code anywhere.
  if coalesce((select auth.role()), '') = 'service_role' then
    return new;
  end if;

  -- Applies to EVERY authenticated actor, not just the account holder.
  --
  -- An earlier cut of this trigger returned early when auth.uid() <> old.id, on
  -- the reasoning that cross-profile edits were "already gated by the site-admin
  -- branch of profiles_update". That gate is about ROWS. RLS decides which rows
  -- you may touch and says nothing about which columns — so a site admin, whose
  -- branch grants them any profile at their school, could PATCH a colleague's row
  -- and set is_speddy_admin = true, promoting a school-scoped admin into a global
  -- platform admin (`/internal`). Confirmed exploitable against production before
  -- this change: HTTP 200, is_speddy_admin flipped. Caught by CodeRabbit on PR #782.
  if new.role is distinct from old.role
     or new.is_speddy_admin is distinct from old.is_speddy_admin
     or new.school_id is distinct from old.school_id
     or new.district_id is distinct from old.district_id
  then
    raise exception
      'profiles: role, is_speddy_admin, school_id and district_id can only be changed by a service_role flow'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.profiles_guard_immutable_columns() is
  'SPE-332: role/is_speddy_admin/school_id/district_id are changeable only by service_role. Enforced in a trigger rather than the profiles_update WITH CHECK because a policy cannot reference OLD (the subquery workaround made the policy self-recursive, 42P17) and because RLS gates rows, not columns — the site-admin row grant would otherwise permit privilege escalation.';

drop trigger if exists profiles_guard_immutable_columns on public.profiles;

create trigger profiles_guard_immutable_columns
  before update on public.profiles
  for each row
  execute function public.profiles_guard_immutable_columns();
