-- SPE-10: Restrict EXECUTE on SECURITY DEFINER functions exposed to anon/authenticated.
--
-- Advisors anon_security_definer_function_executable (49) and
-- authenticated_security_definer_function_executable (49). These functions were
-- executable by anon/authenticated because they carried the default PUBLIC grant
-- (plus explicit anon/authenticated grants). SECURITY DEFINER bypasses RLS, so a
-- function callable by anon effectively grants RLS-bypassed access.
--
-- This migration covers two low-risk tiers (see SPE-10 for the full audit):
--   Tier 1 — trigger functions: invoked by triggers, where EXECUTE is not checked.
--            Safe to revoke from PUBLIC/anon/authenticated entirely.
--   Tier 2 — revoke anon (and PUBLIC) on the remaining functions while KEEPING
--            authenticated, which still needs them (RLS policy helpers and
--            client-invoked RPCs). The signup/admin flows that use
--            create_profile_for_new_user / mark_password_reset run via the
--            service_role client, so dropping anon does not affect them.
--
-- service_role and the table owner (postgres) retain EXECUTE throughout.
-- Reversible: re-GRANT EXECUTE ... TO <role> if anything is found to need it.

-- ── Tier 1: trigger functions ────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION
  public.capture_sign_in_log(),
  public.check_progress_milestones(),
  public.handle_new_user(),
  public.handle_new_user_schools(),
  public.set_holidays_created_by(),
  public.update_updated_at(),
  public.update_updated_at_column(),
  public.update_holidays_updated_at(),
  public.update_calendar_events_updated_at(),
  public.update_group_documents_updated_at(),
  public.update_ai_generated_lessons_updated_at(),
  public.validate_session_assignment_permissions()
FROM PUBLIC, anon, authenticated;

-- ── Tier 2: revoke anon (+ PUBLIC); authenticated retained ───────────────────
REVOKE EXECUTE ON FUNCTION
  public.can_assign_sea_to_session(provider_id uuid, sea_id uuid),
  public.can_assign_sea_to_session(provider_id uuid, sea_id uuid, session_id uuid),
  public.can_assign_specialist_to_session(provider_id uuid, specialist_id uuid),
  public.can_assign_specialist_to_session(provider_id uuid, specialist_id uuid, current_school_id uuid),
  public.can_view_team_member(target_user_id uuid),
  public.copy_schedule_to_year(p_school_id text, p_from_year text, p_to_year text),
  public.create_profile_for_new_user(user_id uuid, user_email text, user_metadata jsonb),
  public.find_all_team_members_multi_school(current_user_id uuid, target_school_id character varying),
  public.find_all_team_members_v2(current_user_id uuid),
  public.find_matching_provider_roles(p_student_id uuid),
  public.find_matching_provider_sessions(p_student_id uuid),
  public.find_school_ids_by_names(p_school_site_name text, p_school_district_name text, p_state_name text),
  public.get_available_specialists(current_user_id uuid),
  public.get_available_specialists(current_user_id uuid, filter_school_id character varying),
  public.get_available_specialists(current_user_id uuid, current_school_id uuid),
  public.get_care_assignable_users(p_school_id character varying),
  public.get_my_school_ids(),
  public.get_providers_at_my_schools(),
  public.get_scheduling_data_batch(p_provider_id uuid, p_school_site text),
  public.get_school_migration_stats(),
  public.get_school_seas(p_school_id character varying, p_school_site character varying, p_school_district character varying),
  public.get_school_site_admins(p_school_id text),
  public.get_sea_assigned_sessions(sea_user_id uuid),
  public.get_sea_students(p_school_id character varying, p_school_site text, p_school_district text),
  public.get_sign_in_logs(p_limit integer, p_offset integer),
  public.get_special_activity_teacher_name(activity_teacher_id uuid, activity_teacher_name text),
  public.get_student_district_id(p_student_id uuid),
  public.get_student_school_id(p_student_id uuid),
  public.get_teacher_student_ids(user_id uuid),
  public.get_user_schools(user_id uuid),
  public.import_student_atomic(p_provider_id uuid, p_initials text, p_grade_level text, p_school_site text, p_school_id text, p_district_id text, p_state_id text, p_first_name text, p_last_name text, p_iep_goals text[], p_sessions_per_week integer, p_minutes_per_session integer, p_teacher_id uuid),
  public.increment_referral_uses(referrer_user_id uuid),
  public.is_teacher_for_student(p_student_id uuid, p_account_id uuid),
  public.is_teacher_of_student(student_uuid uuid),
  public.mark_password_reset(target_user_id uuid),
  public.upsert_students_atomic(p_provider_id uuid, p_students jsonb),
  public.user_accessible_school_ids()
FROM PUBLIC, anon;
