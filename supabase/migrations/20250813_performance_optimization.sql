-- PERFORMANCE OPTIMIZATION FOR STRUCTURED SCHOOL SYSTEM
-- Add optimized indexes and query improvements

-- Create composite indexes for common query patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_school_role 
  ON profiles(school_id, role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_provider_school 
  ON students(provider_id, school_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_school_grade 
  ON students(school_id, grade_level);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bell_schedules_school_day 
  ON bell_schedules(school_id, day_of_week);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedule_sessions_student_date 
  ON schedule_sessions(student_id, date);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedule_sessions_date_completed 
  ON schedule_sessions(date, completed);

-- Create partial indexes for common filters
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schedule_sessions_incomplete 
  ON schedule_sessions(student_id, date) 
  WHERE completed = false;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_active 
  ON students(school_id, provider_id) 
  WHERE sessions_per_week > 0;

-- Add indexes for foreign key lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_districts_state 
  ON districts(state_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_schools_district 
  ON schools(district_id);

-- Create materialized view for school statistics (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS school_statistics AS
SELECT 
  s.id as school_id,
  s.name as school_name,
  d.name as district_name,
  st.abbreviation as state_code,
  COUNT(DISTINCT p.id) as total_staff,
  COUNT(DISTINCT stu.id) as total_students,
  COUNT(DISTINCT CASE WHEN p.role = 'resource' THEN p.id END) as resource_specialists,
  COUNT(DISTINCT CASE WHEN p.role = 'speech' THEN p.id END) as speech_therapists,
  COUNT(DISTINCT CASE WHEN p.role = 'ot' THEN p.id END) as ot_specialists,
  COUNT(DISTINCT CASE WHEN p.role = 'counseling' THEN p.id END) as counselors,
  COUNT(DISTINCT stu.provider_id) as active_providers,
  AVG(stu.sessions_per_week) as avg_sessions_per_week,
  AVG(stu.minutes_per_session) as avg_minutes_per_session
FROM schools s
JOIN districts d ON s.district_id = d.id
JOIN states st ON d.state_id = st.id
LEFT JOIN profiles p ON p.school_id = s.id
LEFT JOIN students stu ON stu.school_id = s.id
GROUP BY s.id, s.name, d.name, st.abbreviation;

-- Create index on materialized view
CREATE UNIQUE INDEX idx_school_statistics_school_id 
  ON school_statistics(school_id);

-- Create function to refresh statistics (can be called by cron job)
CREATE OR REPLACE FUNCTION refresh_school_statistics()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  REFRESH MATERIALIZED VIEW CONCURRENTLY school_statistics;
$$;

-- Grant permissions
GRANT SELECT ON school_statistics TO authenticated;
GRANT EXECUTE ON FUNCTION refresh_school_statistics() TO authenticated;

-- Create optimized function for getting user's school context
CREATE OR REPLACE FUNCTION get_user_school_context(user_id UUID)
RETURNS TABLE (
  school_id VARCHAR(20),
  school_name TEXT,
  district_id VARCHAR(20),
  district_name TEXT,
  state_id VARCHAR(2),
  state_name TEXT,
  state_abbreviation VARCHAR(2),
  nces_id VARCHAR(20),
  total_staff INTEGER,
  total_students INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    p.school_id,
    s.name as school_name,
    p.district_id,
    d.name as district_name,
    p.state_id,
    st.name as state_name,
    st.abbreviation as state_abbreviation,
    s.nces_id,
    COALESCE(stats.total_staff, 0)::INTEGER as total_staff,
    COALESCE(stats.total_students, 0)::INTEGER as total_students
  FROM profiles p
  JOIN schools s ON p.school_id = s.id
  JOIN districts d ON s.district_id = d.id
  JOIN states st ON d.state_id = st.id
  LEFT JOIN school_statistics stats ON stats.school_id = s.id
  WHERE p.id = user_id;
$$;

-- Grant permission
GRANT EXECUTE ON FUNCTION get_user_school_context(UUID) TO authenticated;

-- Analyze tables to update statistics for query planner
ANALYZE profiles;
ANALYZE students;
ANALYZE schools;
ANALYZE districts;
ANALYZE states;
ANALYZE bell_schedules;
ANALYZE schedule_sessions;

-- Add performance monitoring
CREATE TABLE IF NOT EXISTS query_performance_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  query_type TEXT,
  school_id VARCHAR(20),
  execution_time_ms INTEGER,
  record_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for performance monitoring
CREATE INDEX idx_query_performance_log_created 
  ON query_performance_log(created_at DESC);

CREATE INDEX idx_query_performance_log_school 
  ON query_performance_log(school_id, query_type);

-- Add comment for documentation
COMMENT ON MATERIALIZED VIEW school_statistics IS 'Pre-computed school statistics for fast dashboard loading. Refresh periodically via refresh_school_statistics()';
COMMENT ON FUNCTION get_user_school_context(UUID) IS 'Optimized function to get complete school context for a user in a single query';
COMMENT ON TABLE query_performance_log IS 'Track query performance for monitoring and optimization';