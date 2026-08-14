-- SPE-511 — restore (and widen) the authorization gate on copy_schedule_to_year.
--
-- THE HOLE
--
-- The function is SECURITY DEFINER, EXECUTE is granted to `authenticated`, and
-- its body never asks whether the caller has anything to do with p_school_id.
-- The school is a *parameter*. The only gate anywhere was client-side, in
-- lib/supabase/queries/school-year-copy.ts, and it only checked that the caller
-- was signed in — which is not a gate at all, since anyone can call
-- supabase.rpc(...) directly with the session they already hold.
--
-- Demonstrated with a real signed-in session, not inferred: signing in as a SEA
-- with zero admin_permissions rows and calling this against a school in another
-- district executed successfully. An attacker gets owner-privileged writes into
-- eight scheduling tables for a school they have nothing to do with — and,
-- because the "target year already has data" check below then fires forever
-- after, permanently blocks that school's real admin from running the
-- legitimate copy.
--
-- HOW IT WENT MISSING
--
-- 20260402 shipped this function *with* a site-admin gate. 20260407, 20260409
-- and 20260413 each CREATE OR REPLACE'd it to add columns, and each rewrote the
-- body without carrying the gate forward. Nothing failed, because unit tests
-- mock the Supabase client and therefore cannot see grants or SECURITY DEFINER
-- behaviour at all — they pass identically either way. This is the same class of
-- silent regression as SPE-332.
--
-- THE POLICY (product decision, 2026-08-14)
--
--   * site_admin    — may copy for the school named on their grant, only.
--   * district_admin— may copy for any school in their district.
--   * everyone else — refused. `district_tech` is deliberately NOT included:
--                     it is an integrations role, not a scheduling one.
--
-- A district admin's grant carries district_id and no school_id, so the target
-- school's district is resolved through `schools`. All six school_ids that
-- currently hold scheduling data resolve there with a non-null district_id, so
-- this introduces no dead end. If the school is unknown, v_district_id is NULL
-- and the district branch cannot match (guarded explicitly rather than relying
-- on NULL-comparison semantics).
--
-- The refusal raises SQLSTATE 42501 *and* a message beginning "Not authorized",
-- matching the convention upsert_students_atomic already uses. Both signals are
-- deliberate: scripts/sim-district/verify-scheduling-rpc.ts asserts the refusal
-- is an authorization error specifically, so that an unrelated future failure
-- (year validation, an empty source year) cannot turn that check green while
-- this hole is open.
--
-- Body below is otherwise the 20260413 definition verbatim. search_path keeps
-- pg_temp last per the R1 convention (SPE-289 / SPE-441).

CREATE OR REPLACE FUNCTION public.copy_schedule_to_year(
  p_school_id TEXT,
  p_from_year TEXT,
  p_to_year TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caller_id UUID;
  v_district_id VARCHAR;
  v_bell_count INTEGER := 0;
  v_activity_count INTEGER := 0;
  v_availability_count INTEGER := 0;
  v_pair_count INTEGER := 0;
  v_group_count INTEGER := 0;
  v_member_count INTEGER := 0;
  v_yard_duty_count INTEGER := 0;
  v_instruction_count INTEGER := 0;
  v_new_pair_id UUID;
  v_new_group_id UUID;
  v_pair RECORD;
  v_group RECORD;
  v_cnt INTEGER;
BEGIN
  -- ---- SPE-511 authorization gate -----------------------------------------
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no authenticated user'
      USING ERRCODE = '42501';
  END IF;

  SELECT district_id INTO v_district_id FROM schools WHERE id = p_school_id;

  IF NOT EXISTS (
    SELECT 1 FROM admin_permissions ap
    WHERE ap.admin_id = v_caller_id
      AND (
        (ap.role = 'site_admin' AND ap.school_id = p_school_id)
        OR (ap.role = 'district_admin'
            AND v_district_id IS NOT NULL
            AND ap.district_id = v_district_id)
      )
  ) THEN
    RAISE EXCEPTION 'Not authorized to copy the schedule for school %', p_school_id
      USING ERRCODE = '42501';
  END IF;
  -- -------------------------------------------------------------------------

  -- Check if target year already has data
  IF EXISTS (
    SELECT 1 FROM bell_schedules
    WHERE school_id = p_school_id AND school_year = p_to_year
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM special_activities
    WHERE school_id = p_school_id AND school_year = p_to_year AND deleted_at IS NULL
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM activity_type_availability
    WHERE school_id = p_school_id AND school_year = p_to_year
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM rotation_activity_pairs
    WHERE school_id = p_school_id AND school_year = p_to_year
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM yard_duty_assignments
    WHERE school_id = p_school_id AND school_year = p_to_year
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM instruction_schedules
    WHERE school_id = p_school_id AND school_year = p_to_year
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Target year % already has data for this school', p_to_year;
  END IF;

  -- Copy bell schedules
  INSERT INTO bell_schedules (
    grade_level, day_of_week, start_time, end_time, period_name,
    school_id, school_year, created_by_id, created_by_role,
    school_site, district_id, state_id
  )
  SELECT
    grade_level, day_of_week, start_time, end_time, period_name,
    school_id, p_to_year, created_by_id, created_by_role,
    school_site, district_id, state_id
  FROM bell_schedules
  WHERE school_id = p_school_id AND school_year = p_from_year;
  GET DIAGNOSTICS v_bell_count = ROW_COUNT;

  -- Copy special activities
  INSERT INTO special_activities (
    teacher_id, teacher_name, activity_name, day_of_week, start_time, end_time,
    school_id, school_year, created_by_id, created_by_role,
    school_site, district_id
  )
  SELECT
    teacher_id, teacher_name, activity_name, day_of_week, start_time, end_time,
    school_id, p_to_year, created_by_id, created_by_role,
    school_site, district_id
  FROM special_activities
  WHERE school_id = p_school_id AND school_year = p_from_year AND deleted_at IS NULL;
  GET DIAGNOSTICS v_activity_count = ROW_COUNT;

  -- Copy activity type availability
  INSERT INTO activity_type_availability (
    school_id, school_year, activity_type,
    monday, tuesday, wednesday, thursday, friday,
    monday_start_time, monday_end_time,
    tuesday_start_time, tuesday_end_time,
    wednesday_start_time, wednesday_end_time,
    thursday_start_time, thursday_end_time,
    friday_start_time, friday_end_time
  )
  SELECT
    school_id, p_to_year, activity_type,
    monday, tuesday, wednesday, thursday, friday,
    monday_start_time, monday_end_time,
    tuesday_start_time, tuesday_end_time,
    wednesday_start_time, wednesday_end_time,
    thursday_start_time, thursday_end_time,
    friday_start_time, friday_end_time
  FROM activity_type_availability
  WHERE school_id = p_school_id AND school_year = p_from_year;
  GET DIAGNOSTICS v_availability_count = ROW_COUNT;

  -- Copy rotation pairs, groups, and members
  FOR v_pair IN
    SELECT * FROM rotation_activity_pairs
    WHERE school_id = p_school_id AND school_year = p_from_year
  LOOP
    INSERT INTO rotation_activity_pairs (school_id, school_year, activity_type_a, activity_type_b)
    VALUES (p_school_id, p_to_year, v_pair.activity_type_a, v_pair.activity_type_b)
    RETURNING id INTO v_new_pair_id;
    v_pair_count := v_pair_count + 1;

    FOR v_group IN
      SELECT * FROM rotation_groups WHERE pair_id = v_pair.id
    LOOP
      INSERT INTO rotation_groups (pair_id, name, school_year)
      VALUES (v_new_pair_id, v_group.name, p_to_year)
      RETURNING id INTO v_new_group_id;
      v_group_count := v_group_count + 1;

      INSERT INTO rotation_group_members (group_id, teacher_id, day_of_week, start_time, end_time, school_year)
      SELECT v_new_group_id, teacher_id, day_of_week, start_time, end_time, p_to_year
      FROM rotation_group_members
      WHERE group_id = v_group.id;
      GET DIAGNOSTICS v_cnt = ROW_COUNT;
      v_member_count := v_member_count + v_cnt;
    END LOOP;
  END LOOP;

  -- Copy yard duty assignments
  INSERT INTO yard_duty_assignments (
    school_id, school_year, period_name, zone_name, day_of_week,
    start_time, end_time, teacher_id, staff_id, assignee_name, created_by_id
  )
  SELECT
    school_id, p_to_year, period_name, zone_name, day_of_week,
    start_time, end_time, teacher_id, staff_id, assignee_name, created_by_id
  FROM yard_duty_assignments
  WHERE school_id = p_school_id AND school_year = p_from_year;
  GET DIAGNOSTICS v_yard_duty_count = ROW_COUNT;

  -- Copy instruction schedules
  INSERT INTO instruction_schedules (
    school_id, school_year, teacher_id, teacher_name, subject,
    day_of_week, start_time, end_time, created_by_id
  )
  SELECT
    school_id, p_to_year, teacher_id, teacher_name, subject,
    day_of_week, start_time, end_time, created_by_id
  FROM instruction_schedules
  WHERE school_id = p_school_id AND school_year = p_from_year;
  GET DIAGNOSTICS v_instruction_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'bell_schedules', v_bell_count,
    'special_activities', v_activity_count,
    'activity_type_availability', v_availability_count,
    'rotation_pairs', v_pair_count,
    'rotation_groups', v_group_count,
    'rotation_group_members', v_member_count,
    'yard_duty_assignments', v_yard_duty_count,
    'instruction_schedules', v_instruction_count
  );
END;
$$;

COMMENT ON FUNCTION public.copy_schedule_to_year(TEXT, TEXT, TEXT) IS
  'Copies a school''s schedule from one year to another, atomically. SPE-511: '
  'authorized to site_admins of that school and district_admins of its district '
  'only; refuses others with SQLSTATE 42501. Any CREATE OR REPLACE of this '
  'function MUST carry the gate forward — it was silently dropped three times '
  'between 20260402 and 20260413.';
