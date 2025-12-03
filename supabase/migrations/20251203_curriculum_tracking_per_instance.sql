-- Migration: Change curriculum_tracking from group-level to session-instance-level
-- This ensures each session instance has independent curriculum tracking,
-- rather than sharing across all weeks via group_id

-- Step 1: Delete all group-based curriculum tracking records
-- These will be recreated per-session as needed
DELETE FROM curriculum_tracking WHERE group_id IS NOT NULL;

-- Step 2: Drop existing RLS policies (they reference group_id)
DROP POLICY IF EXISTS "Providers can view their own curriculum tracking" ON curriculum_tracking;
DROP POLICY IF EXISTS "Providers can insert their own curriculum tracking" ON curriculum_tracking;
DROP POLICY IF EXISTS "Providers can update their own curriculum tracking" ON curriculum_tracking;
DROP POLICY IF EXISTS "Providers can delete their own curriculum tracking" ON curriculum_tracking;

-- Step 3: Drop the XOR constraint that required either group_id or session_id
ALTER TABLE curriculum_tracking DROP CONSTRAINT IF EXISTS curriculum_tracking_reference;
ALTER TABLE curriculum_tracking DROP CONSTRAINT IF EXISTS curriculum_tracking_session_or_group_check;

-- Step 4: Drop group_id indexes
DROP INDEX IF EXISTS idx_curriculum_tracking_group_id_type;
DROP INDEX IF EXISTS idx_curriculum_tracking_group_id;

-- Step 5: Drop the group_id column
ALTER TABLE curriculum_tracking DROP COLUMN IF EXISTS group_id;

-- Step 6: Make session_id NOT NULL (now required for all records)
ALTER TABLE curriculum_tracking ALTER COLUMN session_id SET NOT NULL;

-- Step 7: Recreate simplified RLS policies (session_id only)

-- SELECT policy
CREATE POLICY "Providers can view their own curriculum tracking" ON curriculum_tracking
FOR SELECT USING (
  session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  )
);

-- INSERT policy
CREATE POLICY "Providers can insert their own curriculum tracking" ON curriculum_tracking
FOR INSERT WITH CHECK (
  session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  )
);

-- UPDATE policy
CREATE POLICY "Providers can update their own curriculum tracking" ON curriculum_tracking
FOR UPDATE USING (
  session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  )
);

-- DELETE policy
CREATE POLICY "Providers can delete their own curriculum tracking" ON curriculum_tracking
FOR DELETE USING (
  session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  )
);

-- Update table comment
COMMENT ON TABLE curriculum_tracking IS 'Tracks curriculum progress per session instance. Supports SPIRE (Levels Foundations, 1-8) and Reveal Math (Grades K-5). For grouped sessions, store with one session_id and look up via group relationship.';
