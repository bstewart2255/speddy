-- Manual cleanup script for old instance-based groups
-- Run this AFTER applying the RLS migration: npx supabase db push

-- Remove all instance-based groups (session_date IS NOT NULL)
UPDATE schedule_sessions
SET
  group_id = NULL,
  group_name = NULL
WHERE group_id IS NOT NULL
  AND session_date IS NOT NULL;

-- Verify the cleanup
SELECT
  COUNT(*) as remaining_grouped_instances
FROM schedule_sessions
WHERE group_id IS NOT NULL
  AND session_date IS NOT NULL;
