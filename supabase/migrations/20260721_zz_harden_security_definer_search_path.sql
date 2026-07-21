-- SPE-289: harden SECURITY DEFINER (and one flagged) functions — pin pg_temp LAST.
--
-- Even a function that sets `search_path = public[, auth]` still searches pg_temp IMPLICITLY
-- FIRST for relation names unless pg_temp appears explicitly. A caller able to create temp
-- objects could therefore shadow an unqualified table reference under definer privileges
-- (PostgreSQL docs recommend putting pg_temp last). Setting pg_temp explicitly LAST closes
-- that vector: public (and auth/pg_catalog/extensions where already present) is searched
-- first, pg_temp only after — so no temp object can shadow a real one.
--
-- Scope / safety:
--   * Verified against prod: NONE of these SECURITY DEFINER functions create temp tables,
--     so appending pg_temp last is behaviorally inert — it only changes resolution ORDER,
--     never what an existing reference resolves to. Applied via ALTER FUNCTION (no body
--     rewrite), so function logic is untouched. ACLs/volatility/return types unchanged.
--   * merge_iep_goals_array is the one function Supabase's linter (function_search_path_mutable)
--     actively flags — it had NO search_path at all. It is SECURITY INVOKER + IMMUTABLE and
--     references no tables (pure array/string ops), so its real risk is nil, but we pin a
--     search_path to clear the advisor. Body reproduced verbatim.
--   * Active risk is low for our setup: authenticated users reach these only through PostgREST
--     (/rest/v1/rpc/...), which does not permit CREATE TEMP TABLE, so the vector isn't reachable
--     via the app. This is defense-in-depth / consistency.
--   * Deferred (documented): schema-qualifying every relation ref in the bodies (public.students,
--     etc.). pg_temp-last already closes the shadowing vector; qualifying ~60 bodies is redundant
--     belt-and-suspenders carrying real regression risk, so it is intentionally NOT done here.
--
-- Ordering: this migration ALTERs functions created by earlier migrations (including today's
-- find_matching_provider_sessions[_batch] / matching_provider_student_ids / get_sea_students),
-- so on a fresh replay it MUST run after all of them — hence the `zz_` filename (sorts last).

-- 1. The advisor-flagged function: add a fixed search_path (pg_temp last). SECURITY INVOKER,
--    IMMUTABLE, body verbatim.
CREATE OR REPLACE FUNCTION public.merge_iep_goals_array(p_existing text[], p_incoming text[])
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_merged text[] := COALESCE(p_existing, ARRAY[]::text[]);
  v_goal text;
BEGIN
  IF p_incoming IS NULL THEN
    RETURN v_merged;
  END IF;

  FOREACH v_goal IN ARRAY p_incoming LOOP
    IF v_goal IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_merged) AS e
      WHERE lower(regexp_replace(e, '^\s+|\s+$', '', 'g'))
          = lower(regexp_replace(v_goal, '^\s+|\s+$', '', 'g'))
    ) THEN
      v_merged := array_append(v_merged, v_goal);
    END IF;
  END LOOP;

  RETURN v_merged;
END;
$function$;

-- 2. Pin pg_temp LAST on every SECURITY DEFINER function in public that lacked it. Existing
--    schemas (auth / pg_catalog / extensions) are preserved; only pg_temp is appended. The five
--    functions that already had pg_temp last are intentionally omitted.
ALTER FUNCTION public.can_access_conversation(p_conversation_id uuid, p_uid uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.can_assign_sea_to_session(provider_id uuid, sea_id uuid, session_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.can_assign_specialist_to_session(provider_id uuid, specialist_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.can_assign_specialist_to_session(provider_id uuid, specialist_id uuid, current_school_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.can_view_team_member(target_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.capture_sign_in_log() SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.chat_audit_message_sent() SET search_path = public, pg_temp;
ALTER FUNCTION public.chat_is_student_participant(p_student_id uuid, p_uid uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.chat_shares_site(p_a uuid, p_b uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.check_progress_milestones() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.create_profile_for_new_user(user_id uuid, user_email text, user_metadata jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_chat_message(p_message_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.find_all_team_members_multi_school(current_user_id uuid, target_school_id character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.find_all_team_members_v2(current_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.find_matching_provider_roles(p_student_id uuid) SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.find_matching_provider_sessions(p_student_id uuid) SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.find_matching_provider_sessions_batch(p_student_ids uuid[]) SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.find_school_ids_by_names(p_school_site_name text, p_school_district_name text, p_state_name text) SET search_path = public, extensions, pg_temp;
ALTER FUNCTION public.get_available_specialists(current_user_id uuid, current_school_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_available_specialists(current_user_id uuid, filter_school_id character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_available_specialists(current_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_care_assignable_users(p_school_id character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_dm_eligible_people(p_school_id character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_chat_students(p_school_id character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_conversations(p_school_id character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_my_school_ids() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_providers_at_my_schools() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_scheduling_data_batch(p_provider_id uuid, p_school_site text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_school_migration_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_school_seas(p_school_id character varying, p_school_site character varying, p_school_district character varying) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_school_site_admins(p_school_id text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sea_assigned_sessions(sea_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sea_students(p_school_id character varying, p_school_site text, p_school_district text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_sign_in_logs(p_limit integer, p_offset integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_special_activity_teacher_name(activity_teacher_id uuid, activity_teacher_name text) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_student_chat_participants(p_student_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_teacher_student_ids(user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.get_user_schools(user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.handle_new_user_schools() SET search_path = public, pg_catalog, pg_temp;
ALTER FUNCTION public.is_chat_eligible(p_uid uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_teacher_for_student(p_student_id uuid, p_account_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.is_teacher_of_student(student_uuid uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.log_conversation_open(p_conversation_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.mark_password_reset(target_user_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.matching_provider_student_ids(p_student_id uuid) SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.merge_iep_goals(p_provider_id uuid, p_entries jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.open_direct_conversation(p_other_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.open_student_conversation(p_student_id uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.propagate_ungroup_after_delivered_by_change() SET search_path = public, pg_temp;
ALTER FUNCTION public.set_holidays_created_by() SET search_path = public, auth, pg_temp;
ALTER FUNCTION public.update_ai_generated_lessons_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_calendar_events_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_group_documents_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_holidays_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_students_atomic(p_provider_id uuid, p_students jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.user_accessible_school_ids() SET search_path = public, pg_temp;
ALTER FUNCTION public.validate_session_assignment_permissions() SET search_path = public, pg_temp;
