-- Cleanup existing groups where delivered_by doesn't match the original grouping
--
-- This migration clears group_id and group_name from template sessions where:
-- 1. The session is in a group
-- 2. The session has been assigned to a different deliverer (SEA/specialist)
-- 3. The group was likely created by a provider who can no longer manage it
--
-- This is a one-time cleanup for data that existed before role-based grouping
-- restrictions were implemented. Future changes will be handled by the
-- auto_ungroup_on_delivered_by_change trigger.

-- Clear groups from sessions where delivered_by doesn't allow the provider to manage them
-- Combined with logging in a single DO block to capture ROW_COUNT correctly
DO $$
DECLARE
  cleaned_count INTEGER;
BEGIN
  -- This handles cases where a provider created a group, then sessions were assigned to SEA/specialist
  UPDATE schedule_sessions
  SET
    group_id = NULL,
    group_name = NULL,
    updated_at = NOW()
  WHERE
    -- Session is in a group
    group_id IS NOT NULL
    -- This is a template session (recurring)
    AND session_date IS NULL
    -- Session is delivered by SEA or specialist (not by the provider who owns it)
    AND delivered_by IN ('sea', 'specialist');

  -- Capture the count and log it
  GET DIAGNOSTICS cleaned_count = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % grouped sessions that were assigned to SEA/specialist', cleaned_count;
END $$;

-- Also clean up any instances that match the cleaned templates
-- Combined with logging in a single DO block
DO $$
DECLARE
  cleaned_instances INTEGER;
BEGIN
  UPDATE schedule_sessions s
  SET
    group_id = NULL,
    group_name = NULL,
    updated_at = NOW()
  FROM (
    SELECT DISTINCT
      provider_id,
      student_id,
      day_of_week,
      start_time
    FROM schedule_sessions
    WHERE
      group_id IS NULL
      AND session_date IS NULL
      AND delivered_by IN ('sea', 'specialist')
  ) templates
  WHERE
    s.provider_id = templates.provider_id
    AND s.student_id = templates.student_id
    AND s.day_of_week = templates.day_of_week
    AND s.start_time = templates.start_time
    AND s.session_date IS NOT NULL
    AND s.group_id IS NOT NULL;

  -- Capture the count and log it
  GET DIAGNOSTICS cleaned_instances = ROW_COUNT;
  RAISE NOTICE 'Cleaned up % grouped session instances matching the templates', cleaned_instances;
END $$;
