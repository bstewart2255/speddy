-- Add school_year column to all schedule tables, defaulting existing rows to '2025-2026'
ALTER TABLE bell_schedules ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE special_activities ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE rotation_activity_pairs ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE rotation_groups ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE rotation_group_members ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE rotation_week_assignments ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';
ALTER TABLE activity_type_availability ADD COLUMN school_year TEXT NOT NULL DEFAULT '2025-2026';

-- Update UNIQUE constraints to include school_year
ALTER TABLE rotation_activity_pairs
  DROP CONSTRAINT IF EXISTS rotation_activity_pairs_school_id_activity_type_a_activity__key;
ALTER TABLE rotation_activity_pairs
  ADD CONSTRAINT rotation_activity_pairs_school_year_unique
  UNIQUE (school_id, school_year, activity_type_a, activity_type_b);

ALTER TABLE activity_type_availability
  DROP CONSTRAINT IF EXISTS activity_type_availability_school_id_activity_type_key;
ALTER TABLE activity_type_availability
  ADD CONSTRAINT activity_type_availability_school_year_unique
  UNIQUE (school_id, school_year, activity_type);

-- Add indexes for query performance
CREATE INDEX idx_bell_schedules_school_year ON bell_schedules(school_id, school_year);
CREATE INDEX idx_special_activities_school_year ON special_activities(school_id, school_year);
CREATE INDEX idx_rotation_pairs_school_year ON rotation_activity_pairs(school_id, school_year);
CREATE INDEX idx_activity_availability_school_year ON activity_type_availability(school_id, school_year);

-- Create RPC for atomic year copy
CREATE OR REPLACE FUNCTION copy_schedule_to_year(
  p_school_id TEXT,
  p_from_year TEXT,
  p_to_year TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id UUID;
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
  -- Verify caller is a site admin for this school
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM admin_permissions
    WHERE admin_id = v_caller_id
      AND school_id = p_school_id
      AND role = 'site_admin'
  ) THEN
    RAISE EXCEPTION 'You do not have site admin permission for this school';
  END IF;

  -- Check if target year already has data in any of the copied tables
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
  ) THEN
    RAISE EXCEPTION 'Target year % already has data for this school', p_to_year;
  END IF;

  -- Copy bell_schedules (including provider_id and content_hash)
  INSERT INTO bell_schedules (
    provider_id, grade_level, day_of_week, start_time, end_time, period_name,
    school_id, school_year, created_by_id, created_by_role,
    school_site, district_id, state_id, content_hash
  )
  SELECT
    provider_id, grade_level, day_of_week, start_time, end_time, period_name,
    school_id, p_to_year, created_by_id, created_by_role,
    school_site, district_id, state_id, content_hash
  FROM bell_schedules
  WHERE school_id = p_school_id AND school_year = p_from_year;

  GET DIAGNOSTICS v_bell_count = ROW_COUNT;

  -- Copy special_activities (non-deleted only, including provider_id and content_hash)
  INSERT INTO special_activities (
    provider_id, teacher_id, teacher_name, activity_name, day_of_week, start_time, end_time,
    school_id, school_year, created_by_id, created_by_role,
    school_site, district_id, content_hash
  )
  SELECT
    provider_id, teacher_id, teacher_name, activity_name, day_of_week, start_time, end_time,
    school_id, p_to_year, created_by_id, created_by_role,
    school_site, district_id, content_hash
  FROM special_activities
  WHERE school_id = p_school_id AND school_year = p_from_year AND deleted_at IS NULL;

  GET DIAGNOSTICS v_activity_count = ROW_COUNT;

  -- Copy activity_type_availability
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

  -- Copy rotation_activity_pairs -> rotation_groups -> rotation_group_members
  -- Note: rotation_week_assignments are NOT copied because they contain
  -- date-specific entries (e.g., "week of Sept 8") that don't apply to the
  -- next school year. Admins configure these fresh.
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
