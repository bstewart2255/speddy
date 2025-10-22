-- Grant necessary permissions to authenticated users on schedule_sessions table
-- This is required for RLS policies to work properly

-- Grant SELECT, INSERT, UPDATE, DELETE to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON schedule_sessions TO authenticated;

-- Ensure RLS is enabled
ALTER TABLE schedule_sessions ENABLE ROW LEVEL SECURITY;

-- Add comment for documentation
COMMENT ON TABLE schedule_sessions IS
'Session scheduling data. Access controlled by RLS policies.
Authenticated users have base permissions but access is restricted by row-level policies.';
