-- SIMPLIFY TEAM MATCHING FUNCTIONS
-- Remove fuzzy matching and text-based logic, use only exact ID matching

-- Drop old functions
DROP FUNCTION IF EXISTS find_all_team_members(TEXT, TEXT, UUID);
DROP FUNCTION IF EXISTS find_all_team_members_v2(UUID);
DROP FUNCTION IF EXISTS normalize_school_name(TEXT);

-- Create new simplified team matching function
CREATE OR REPLACE FUNCTION find_all_team_members(current_user_id UUID)
RETURNS TABLE (
  id UUID,
  email TEXT,
  display_name TEXT,
  full_name TEXT,
  role TEXT,
  school_id VARCHAR(20),
  district_id VARCHAR(20),
  state_id VARCHAR(2),
  grade_level TEXT,
  subject TEXT,
  bio TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    p.id,
    p.email,
    p.display_name,
    p.full_name,
    p.role,
    p.school_id,
    p.district_id,
    p.state_id,
    p.grade_level,
    p.subject,
    p.bio,
    p.avatar_url,
    p.created_at
  FROM profiles p
  WHERE p.school_id = (
    SELECT school_id 
    FROM profiles 
    WHERE id = current_user_id
  )
  AND p.id != current_user_id
  ORDER BY p.created_at DESC;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION find_all_team_members(UUID) TO authenticated;

-- Create optimized function for checking if users are teammates
CREATE OR REPLACE FUNCTION are_teammates(user1_id UUID, user2_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM profiles p1
    JOIN profiles p2 ON p1.school_id = p2.school_id
    WHERE p1.id = user1_id
      AND p2.id = user2_id
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION are_teammates(UUID, UUID) TO authenticated;

-- Create function to get school statistics
CREATE OR REPLACE FUNCTION get_school_statistics(user_school_id VARCHAR(20))
RETURNS TABLE (
  total_staff INTEGER,
  total_students INTEGER,
  total_sessions INTEGER,
  active_providers INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM profiles WHERE school_id = user_school_id) as total_staff,
    (SELECT COUNT(*)::INTEGER FROM students WHERE school_id = user_school_id) as total_students,
    (SELECT COUNT(*)::INTEGER FROM schedule_sessions ss 
     JOIN students s ON ss.student_id = s.id 
     WHERE s.school_id = user_school_id) as total_sessions,
    (SELECT COUNT(DISTINCT provider_id)::INTEGER FROM students WHERE school_id = user_school_id) as active_providers;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_school_statistics(VARCHAR) TO authenticated;

-- Update migration statistics function to reflect completion
DROP FUNCTION IF EXISTS get_school_migration_stats();

CREATE OR REPLACE FUNCTION get_system_health_stats()
RETURNS TABLE (
  total_users BIGINT,
  total_schools BIGINT,
  total_districts BIGINT,
  total_states BIGINT,
  avg_users_per_school NUMERIC,
  system_status TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT 
    (SELECT COUNT(*) FROM profiles) as total_users,
    (SELECT COUNT(*) FROM schools) as total_schools,
    (SELECT COUNT(*) FROM districts) as total_districts,
    (SELECT COUNT(*) FROM states) as total_states,
    (SELECT ROUND(AVG(user_count)::NUMERIC, 2) FROM (
      SELECT school_id, COUNT(*) as user_count 
      FROM profiles 
      GROUP BY school_id
    ) school_counts) as avg_users_per_school,
    'optimized'::TEXT as system_status;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_system_health_stats() TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION find_all_team_members(UUID) IS 'Simplified team matching using exact school_id comparison. High performance with indexed lookups.';
COMMENT ON FUNCTION are_teammates(UUID, UUID) IS 'Quick check if two users are in the same school.';
COMMENT ON FUNCTION get_school_statistics(VARCHAR) IS 'Get statistics for a specific school.';
COMMENT ON FUNCTION get_system_health_stats() IS 'Overall system health and usage statistics.';