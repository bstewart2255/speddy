-- SPE-114 (SPE-10 Tier 3): revoke `authenticated` EXECUTE on SECURITY DEFINER
-- functions that signed-in users do not need to call directly.
--
-- Follows SPE-10 Tier 1+2 (which removed anon + trigger-function access). Of the
-- 37 functions still executable by `authenticated`, these 15 don't need it (full
-- per-function audit in SPE-114):
--   * Service-role-only callers (2): create_profile_for_new_user and
--     get_sign_in_logs are only ever invoked via the service_role client in
--     server routes; service_role bypasses these grants.
--   * Internal-only via definer chain (5): can_assign_(sea|specialist)_to_session
--     are called only by the validate_session_assignment_permissions trigger, and
--     find_school_ids_by_names only inside create_profile_for_new_user. The definer
--     caller runs as the owner, so `authenticated` never needs direct EXECUTE.
--   * Unused (8): zero references anywhere in the app (no RPC, no RLS policy, not
--     called by any other function) — can_view_team_member,
--     find_all_team_members_multi_school, get_sea_assigned_sessions,
--     get_special_activity_teacher_name, get_user_schools, increment_referral_uses,
--     is_teacher_for_student, is_teacher_of_student.
--
-- The 22 functions authenticated genuinely uses (RLS-policy helpers + client RPCs)
-- are intentionally left untouched. service_role and the owner (postgres) retain
-- EXECUTE. Guarded with to_regprocedure() for fresh-DB replayability + idempotency.
-- Reversible: GRANT EXECUTE ON FUNCTION <sig> TO authenticated;

do $$
declare
  sig text;
  revoke_authenticated text[] := array[
    -- service-role-only callers
    'public.create_profile_for_new_user(uuid, text, jsonb)',
    'public.get_sign_in_logs(integer, integer)',
    -- internal-only via definer chain
    'public.can_assign_sea_to_session(uuid, uuid)',
    'public.can_assign_sea_to_session(uuid, uuid, uuid)',
    'public.can_assign_specialist_to_session(uuid, uuid)',
    'public.can_assign_specialist_to_session(uuid, uuid, uuid)',
    'public.find_school_ids_by_names(text, text, text)',
    -- unused (zero references in the app)
    'public.can_view_team_member(uuid)',
    'public.find_all_team_members_multi_school(uuid, character varying)',
    'public.get_sea_assigned_sessions(uuid)',
    'public.get_special_activity_teacher_name(uuid, text)',
    'public.get_user_schools(uuid)',
    'public.increment_referral_uses(uuid)',
    'public.is_teacher_for_student(uuid, uuid)',
    'public.is_teacher_of_student(uuid)'
  ];
begin
  foreach sig in array revoke_authenticated loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', sig);
    end if;
  end loop;
end $$;
