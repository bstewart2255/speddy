-- Fix bug where unscheduled sessions can be marked as completed
-- This causes issues with session count adjustment logic

BEGIN;

-- Step 1: Clean up existing orphaned completed unscheduled sessions
-- These sessions should never have been marked as completed since they haven't been scheduled yet
DELETE FROM schedule_sessions
WHERE day_of_week IS NULL
  AND is_completed = true;

-- Step 2: Add CHECK constraint to prevent unscheduled sessions from being marked as completed
-- This ensures the bug cannot recur
ALTER TABLE schedule_sessions
  ADD CONSTRAINT unscheduled_sessions_cannot_be_completed
  CHECK (
    -- If session is unscheduled (day_of_week IS NULL), then is_completed must be false
    (day_of_week IS NULL AND is_completed = false)
    OR
    -- If session is scheduled (day_of_week IS NOT NULL), is_completed can be true or false
    (day_of_week IS NOT NULL)
  );

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT unscheduled_sessions_cannot_be_completed ON schedule_sessions IS
  'Prevents unscheduled sessions (day_of_week IS NULL) from being marked as completed. Only scheduled sessions can be marked as completed.';

COMMIT;
