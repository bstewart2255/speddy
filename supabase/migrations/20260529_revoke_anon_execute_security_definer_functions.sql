-- SPE-10: Restrict EXECUTE on SECURITY DEFINER functions exposed to anon/authenticated.
--
-- Advisors anon_security_definer_function_executable (49) and
-- authenticated_security_definer_function_executable (49). These functions were
-- executable by anon/authenticated because they carried the default PUBLIC grant
-- (plus explicit anon/authenticated grants). SECURITY DEFINER bypasses RLS, so a
-- function callable by anon effectively grants RLS-bypassed access.
--
-- Two low-risk tiers (see SPE-10 for the full audit):
--   Tier 1 — trigger functions: invoked by triggers, where EXECUTE is not checked.
--            Safe to revoke from PUBLIC/anon/authenticated entirely.
--   Tier 2 — revoke anon (and PUBLIC) while KEEPING authenticated, which still
--            needs them (RLS policy helpers and client-invoked RPCs). The
--            signup/admin flows that use create_profile_for_new_user /
--            mark_password_reset run via the service_role client, so dropping
--            anon does not affect them.
--
-- Each revoke is guarded with to_regprocedure(): some of these functions exist in
-- production via historical drift but have no CREATE in the committed migrations,
-- and REVOKE has no IF EXISTS. Guarding keeps this migration replayable on a
-- fresh database (missing functions are skipped) and idempotent. service_role and
-- the owner (postgres) retain EXECUTE throughout. Reversible via GRANT EXECUTE.

do $$
declare
  sig text;
  -- Tier 1: trigger functions -> revoke from PUBLIC, anon, authenticated
  tier1_revoke_all text[] := array[
    'public.capture_sign_in_log()',
    'public.check_progress_milestones()',
    'public.handle_new_user()',
    'public.handle_new_user_schools()',
    'public.set_holidays_created_by()',
    'public.update_updated_at()',
    'public.update_updated_at_column()',
    'public.update_holidays_updated_at()',
    'public.update_calendar_events_updated_at()',
    'public.update_group_documents_updated_at()',
    'public.update_ai_generated_lessons_updated_at()',
    'public.validate_session_assignment_permissions()'
  ];
  -- Tier 2: revoke PUBLIC + anon; authenticated retained
  tier2_revoke_anon text[] := array[
    'public.can_assign_sea_to_session(uuid, uuid)',
    'public.can_assign_sea_to_session(uuid, uuid, uuid)',
    'public.can_assign_specialist_to_session(uuid, uuid)',
    'public.can_assign_specialist_to_session(uuid, uuid, uuid)',
    'public.can_view_team_member(uuid)',
    'public.copy_schedule_to_year(text, text, text)',
    'public.create_profile_for_new_user(uuid, text, jsonb)',
    'public.find_all_team_members_multi_school(uuid, character varying)',
    'public.find_all_team_members_v2(uuid)',
    'public.find_matching_provider_roles(uuid)',
    'public.find_matching_provider_sessions(uuid)',
    'public.find_school_ids_by_names(text, text, text)',
    'public.get_available_specialists(uuid)',
    'public.get_available_specialists(uuid, character varying)',
    'public.get_available_specialists(uuid, uuid)',
    'public.get_care_assignable_users(character varying)',
    'public.get_my_school_ids()',
    'public.get_providers_at_my_schools()',
    'public.get_scheduling_data_batch(uuid, text)',
    'public.get_school_migration_stats()',
    'public.get_school_seas(character varying, character varying, character varying)',
    'public.get_school_site_admins(text)',
    'public.get_sea_assigned_sessions(uuid)',
    'public.get_sea_students(character varying, text, text)',
    'public.get_sign_in_logs(integer, integer)',
    'public.get_special_activity_teacher_name(uuid, text)',
    'public.get_student_district_id(uuid)',
    'public.get_student_school_id(uuid)',
    'public.get_teacher_student_ids(uuid)',
    'public.get_user_schools(uuid)',
    'public.import_student_atomic(uuid, text, text, text, text, text, text, text, text, text[], integer, integer, uuid)',
    'public.increment_referral_uses(uuid)',
    'public.is_teacher_for_student(uuid, uuid)',
    'public.is_teacher_of_student(uuid)',
    'public.mark_password_reset(uuid)',
    'public.upsert_students_atomic(uuid, jsonb)',
    'public.user_accessible_school_ids()'
  ];
begin
  foreach sig in array tier1_revoke_all loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', sig);
    end if;
  end loop;

  foreach sig in array tier2_revoke_anon loop
    if to_regprocedure(sig) is not null then
      execute format('revoke execute on function %s from public, anon', sig);
    end if;
  end loop;
end $$;
