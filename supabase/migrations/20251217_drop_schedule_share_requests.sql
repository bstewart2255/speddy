-- Migration: Drop schedule_share_requests table
-- This table is no longer needed since schedule sharing is now automatic at the district level

-- Drop RLS policies
DROP POLICY IF EXISTS "Users can view share requests for their schools" ON schedule_share_requests;
DROP POLICY IF EXISTS "Users can create share requests for their schools" ON schedule_share_requests;
DROP POLICY IF EXISTS "Users can delete their own share requests" ON schedule_share_requests;

-- Drop indexes
DROP INDEX IF EXISTS idx_schedule_share_requests_school_id;
DROP INDEX IF EXISTS idx_schedule_share_requests_sharer_id;

-- Drop table
DROP TABLE IF EXISTS schedule_share_requests;
