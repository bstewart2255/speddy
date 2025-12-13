-- Migration: Sync instance assignments with their templates
--
-- Problem: When a session is assigned on the Main Schedule (template), existing
-- instances don't get updated. This causes the Calendar to show sessions as
-- "My Sessions" when they should be filtered out because they're assigned to someone else.
--
-- Solution: Update all instances to match their template's assignment fields.
--
-- NOTE: This migration must be run with superuser privileges (e.g., via Supabase Dashboard
-- SQL Editor) because it temporarily disables the assignment validation trigger.

-- Temporarily disable the assignment validation trigger (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_session_assignment_permissions') THEN
    ALTER TABLE schedule_sessions DISABLE TRIGGER trg_validate_session_assignment_permissions;
  END IF;
END $$;

-- Single UPDATE to sync ALL assignment fields from template to instances
-- This prevents "dual-assigned" state by always setting both columns
UPDATE schedule_sessions i
SET
  assigned_to_specialist_id = t.assigned_to_specialist_id,
  assigned_to_sea_id = t.assigned_to_sea_id,
  delivered_by = t.delivered_by,
  updated_at = NOW()
FROM schedule_sessions t
WHERE i.session_date IS NOT NULL  -- Instance
  AND t.session_date IS NULL      -- Template
  AND i.student_id = t.student_id
  AND i.provider_id = t.provider_id
  AND i.day_of_week = t.day_of_week
  AND i.start_time = t.start_time
  AND (
    i.assigned_to_specialist_id IS DISTINCT FROM t.assigned_to_specialist_id
    OR i.assigned_to_sea_id IS DISTINCT FROM t.assigned_to_sea_id
  )
  AND i.completed_at IS NULL  -- Don't modify completed sessions
  AND i.session_date >= CURRENT_DATE;  -- Only future/current sessions

-- Re-enable the assignment validation trigger (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_validate_session_assignment_permissions') THEN
    ALTER TABLE schedule_sessions ENABLE TRIGGER trg_validate_session_assignment_permissions;
  END IF;
END $$;
