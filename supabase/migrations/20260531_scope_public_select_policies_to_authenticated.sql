-- Fix anon-read regression introduced by SPE-10 (PR #640).
--
-- SPE-10 revoked `anon` EXECUTE on SECURITY DEFINER helper functions. Five of
-- them are referenced inside `TO public` SELECT policies on `profiles` and
-- `schedule_sessions`. Because those policies also apply to `anon`, an
-- unauthenticated SELECT on either table now evaluates the policy, calls the
-- helper, and fails with "permission denied for function" instead of returning
-- zero rows (the prior behavior). Verified by querying as the `anon` role.
--
-- We do NOT re-grant `anon` EXECUTE: three of the helpers
-- (get_student_school_id, get_student_district_id, get_teacher_student_ids) take
-- an arbitrary id and do not authorize the caller, so granting `anon` would
-- re-open the exact RLS-bypass SPE-10 closed. Instead, scope these SELECT
-- policies to `authenticated`. Anon then matches no SELECT policy on these tables
-- and gets zero rows (same as pre-SPE-10) without calling the helpers; the
-- functions stay anon-revoked; authenticated behavior is unchanged (USING clause
-- preserved). These tables are not read by logged-out users.
--
-- Guarded with existence checks so the migration is replayable on a fresh DB.

do $$
begin
  if exists (select 1 from pg_policies where schemaname='public' and tablename='profiles'
             and policyname='profiles_select') then
    execute 'alter policy "profiles_select" on public.profiles to authenticated';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='schedule_sessions'
             and policyname='District admins can view schedule sessions in their district') then
    execute 'alter policy "District admins can view schedule sessions in their district" on public.schedule_sessions to authenticated';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='schedule_sessions'
             and policyname='Site admins can view schedule sessions at their school') then
    execute 'alter policy "Site admins can view schedule sessions at their school" on public.schedule_sessions to authenticated';
  end if;

  if exists (select 1 from pg_policies where schemaname='public' and tablename='schedule_sessions'
             and policyname='schedule_sessions_select') then
    execute 'alter policy "schedule_sessions_select" on public.schedule_sessions to authenticated';
  end if;
end $$;
