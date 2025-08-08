-- Create an RPC function for efficient batch scheduling data fetching
-- This function returns all scheduling-related data in a single query using JSON aggregation

CREATE OR REPLACE FUNCTION get_scheduling_data_batch(
  p_provider_id UUID,
  p_school_site TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Build a JSON object with all the data needed for scheduling
  SELECT json_build_object(
    'workSchedule', (
      SELECT COALESCE(json_agg(row_to_json(ws.*)), '[]'::json)
      FROM (
        SELECT uss.day_of_week
        FROM user_site_schedules uss
        INNER JOIN provider_schools ps ON ps.provider_id = uss.user_id
        WHERE uss.user_id = p_provider_id
          AND ps.school_site = p_school_site
      ) ws
    ),
    'bellSchedules', (
      SELECT COALESCE(json_agg(row_to_json(bs.*)), '[]'::json)
      FROM bell_schedules bs
      WHERE bs.provider_id = p_provider_id
        AND bs.school_site = p_school_site
    ),
    'specialActivities', (
      SELECT COALESCE(json_agg(row_to_json(sa.*)), '[]'::json)
      FROM special_activities sa
      WHERE sa.provider_id = p_provider_id
        AND sa.school_site = p_school_site
    ),
    'existingSessions', (
      SELECT COALESCE(json_agg(row_to_json(es.*)), '[]'::json)
      FROM (
        SELECT ss.*, st.school_site as student_school_site, st.grade_level as student_grade
        FROM schedule_sessions ss
        INNER JOIN students st ON st.id = ss.student_id
        WHERE ss.provider_id = p_provider_id
          AND st.school_site = p_school_site
      ) es
    ),
    'schoolHours', (
      SELECT COALESCE(json_agg(row_to_json(sh.*)), '[]'::json)
      FROM school_hours sh
      WHERE sh.provider_id = p_provider_id
        AND sh.school_site = p_school_site
    )
  ) INTO result;
  
  RETURN result;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_scheduling_data_batch(UUID, TEXT) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_scheduling_data_batch IS 'Fetches all scheduling-related data for a provider and school in a single efficient query. Used to prevent N+1 query issues in the auto-scheduler.';