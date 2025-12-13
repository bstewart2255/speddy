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

-- Temporarily disable the assignment validation trigger
ALTER TABLE schedule_sessions DISABLE TRIGGER trg_validate_session_assignment_permissions;

-- Update instances to match their template's specialist assignment
UPDATE schedule_sessions i
SET
  assigned_to_specialist_id = t.assigned_to_specialist_id,
  delivered_by = t.delivered_by,
  updated_at = NOW()
FROM schedule_sessions t
WHERE i.session_date IS NOT NULL  -- Instance
  AND t.session_date IS NULL      -- Template
  AND i.student_id = t.student_id
  AND i.provider_id = t.provider_id
  AND i.day_of_week = t.day_of_week
  AND i.start_time = t.start_time
  AND t.assigned_to_specialist_id IS NOT NULL
  AND (i.assigned_to_specialist_id IS NULL OR i.assigned_to_specialist_id != t.assigned_to_specialist_id);

-- Update instances to match their template's SEA assignment
UPDATE schedule_sessions i
SET
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
  AND t.assigned_to_sea_id IS NOT NULL
  AND (i.assigned_to_sea_id IS NULL OR i.assigned_to_sea_id != t.assigned_to_sea_id);

-- Also sync unassignment: if template has NO assignment, clear instance assignments
-- (but only for future/current instances, not completed ones)
UPDATE schedule_sessions i
SET
  assigned_to_specialist_id = NULL,
  assigned_to_sea_id = NULL,
  delivered_by = 'provider',
  updated_at = NOW()
FROM schedule_sessions t
WHERE i.session_date IS NOT NULL  -- Instance
  AND t.session_date IS NULL      -- Template
  AND i.student_id = t.student_id
  AND i.provider_id = t.provider_id
  AND i.day_of_week = t.day_of_week
  AND i.start_time = t.start_time
  AND t.assigned_to_specialist_id IS NULL
  AND t.assigned_to_sea_id IS NULL
  AND (i.assigned_to_specialist_id IS NOT NULL OR i.assigned_to_sea_id IS NOT NULL)
  AND i.completed_at IS NULL  -- Don't modify completed sessions
  AND i.session_date >= CURRENT_DATE;  -- Only future/current sessions

-- Re-enable the assignment validation trigger
ALTER TABLE schedule_sessions ENABLE TRIGGER trg_validate_session_assignment_permissions;
