-- Fix copy_schedule_to_year: remove school_district and state_id references
-- from special_activities INSERT (columns don't exist on that table)
CREATE OR REPLACE FUNCTION copy_schedule_to_year(
  p_school_id TEXT,
  p_from_year TEXT,
  p_to_year TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bell_count INTEGER := 0;
  v_activity_count INTEGER := 0;
  v_availability_count INTEGER := 0;
  v_pair_count INTEGER := 0;
  v_group_count INTEGER := 0;
  v_member_count INTEGER := 0;
  v_new_pair_id UUID;
  v_new_group_id UUID;
  v_pair RECORD;
  v_group RECORD;
  v_cnt INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM bell_schedules
    WHERE school_id = p_school_id AND school_year = p_to_year
    LIMIT 1
  ) OR EXISTS (
    SELECT 1 FROM special_activities
    WHERE school_id = p_school_id AND school_year = p_to_year AND deleted_at IS NULL
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Target year % already has data for this school', p_to_year;
  END IF;

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

  -- Fixed: removed school_district and state_id (don't exist on special_activities)
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

  RETURN jsonb_build_object(
    'bell_schedules', v_bell_count,
    'special_activities', v_activity_count,
    'activity_type_availability', v_availability_count,
    'rotation_pairs', v_pair_count,
    'rotation_groups', v_group_count,
    'rotation_group_members', v_member_count
  );
END;
$$;
