-- Migration: Add has_conflict column and prevent templates from being completed
-- Issue: GitHub #440
--
-- Purpose:
--   1. Add has_conflict boolean column for clearer conflict state tracking
--      (The existing 'status' field conflates session validity with conflict notification)
--   2. Add CHECK constraint to ensure only dated instances can be marked completed
--      (Templates define recurring schedule - they should never be "completed")

-- =============================================================================
-- STEP 1: Add has_conflict column
-- =============================================================================
-- This provides a cleaner boolean flag for conflict detection
-- Code can gradually migrate from checking status='needs_attention' to has_conflict=true

ALTER TABLE schedule_sessions
ADD COLUMN IF NOT EXISTS has_conflict boolean DEFAULT false;

-- Populate has_conflict from existing status values
UPDATE schedule_sessions
SET has_conflict = (status = 'needs_attention')
WHERE has_conflict IS DISTINCT FROM (status = 'needs_attention');

-- =============================================================================
-- STEP 2: Add CHECK constraint for completion
-- =============================================================================
-- Ensure only dated instances can be marked completed
-- Templates (session_date IS NULL, day_of_week IS NOT NULL) should never be completed
-- Unscheduled (session_date IS NULL, day_of_week IS NULL) should never be completed

-- First, ensure no templates are currently marked as completed
-- (This is also done in restore_missing_templates.sql, but included here for safety)
UPDATE schedule_sessions
SET is_completed = false, completed_at = NULL, completed_by = NULL
WHERE session_date IS NULL
  AND is_completed = true;

-- Add the constraint
ALTER TABLE schedule_sessions
ADD CONSTRAINT chk_completion_only_for_dated_instances
CHECK (is_completed = false OR session_date IS NOT NULL);

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$
DECLARE
  v_has_conflict_count integer;
  v_needs_attention_count integer;
BEGIN
  SELECT COUNT(*) INTO v_has_conflict_count
  FROM schedule_sessions WHERE has_conflict = true;

  SELECT COUNT(*) INTO v_needs_attention_count
  FROM schedule_sessions WHERE status = 'needs_attention';

  IF v_has_conflict_count = v_needs_attention_count THEN
    RAISE NOTICE 'VERIFIED: has_conflict column populated correctly (% sessions)', v_has_conflict_count;
  ELSE
    RAISE WARNING 'MISMATCH: has_conflict=% vs needs_attention=%', v_has_conflict_count, v_needs_attention_count;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN schedule_sessions.has_conflict IS
  'Boolean flag indicating if this session has a scheduling conflict.
   Use this instead of checking status=needs_attention for conflict detection.';

COMMENT ON CONSTRAINT chk_completion_only_for_dated_instances ON schedule_sessions IS
  'Ensures only dated instances (actual sessions with session_date) can be marked completed.
   Templates and unscheduled sessions should never be marked as completed.';
