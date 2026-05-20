-- Fix auto-ungroup behavior when a template's delivered_by changes
--
-- The original trigger (20251018_auto_ungroup_on_delivered_by_change.sql) only
-- cleared group_id and group_name on the template row itself. Two problems:
--
-- 1. group_color was left set, leaving stale data on rows that no longer belong
--    to a group.
-- 2. Date-specific instances of the same template still carried the group, so
--    Week view and Today's Schedule disagreed depending on the date.
-- 3. Removing one template from a group could leave a single remaining template
--    in that group, violating the "groups must have >=2 sessions" rule that the
--    explicit ungroup API enforces.
--
-- Fix: extend the BEFORE trigger to also clear group_color, and add an AFTER
-- trigger that propagates the ungrouping to matching instances and runs the
-- same orphan-cleanup check that the ungroup API performs.

-- Update the BEFORE trigger to also clear group_color on the template row
CREATE OR REPLACE FUNCTION auto_ungroup_on_delivered_by_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL THEN

    NEW.group_id := NULL;
    NEW.group_name := NULL;
    NEW.group_color := NULL;

    RAISE NOTICE 'Auto-ungrouped template session % due to delivered_by change from % to %',
      NEW.id, OLD.delivered_by, NEW.delivered_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- New AFTER trigger: propagate the ungroup to matching instances and clean up
-- any single-session groups that result.
--
-- SECURITY DEFINER so the propagation works even when the affected instances
-- or sibling templates were assigned to a different provider. This is a
-- server-side data-integrity action, not a user-initiated write.
CREATE OR REPLACE FUNCTION propagate_ungroup_after_delivered_by_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_count INTEGER;
  last_template_id UUID;
  last_provider_id UUID;
  last_student_id UUID;
  last_day_of_week INTEGER;
  last_start_time TIME;
BEGIN
  -- Only act when the BEFORE trigger just ungrouped this template
  IF OLD.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL
     AND NEW.group_id IS NULL THEN

    -- Propagate ungroup to matching date-specific instances
    UPDATE schedule_sessions
    SET group_id = NULL,
        group_name = NULL,
        group_color = NULL,
        updated_at = NOW()
    WHERE provider_id = OLD.provider_id
      AND student_id = OLD.student_id
      AND day_of_week = OLD.day_of_week
      AND start_time = OLD.start_time
      AND session_date IS NOT NULL;

    -- If the old group now has only one remaining template, ungroup it too
    -- (groups must have >=2 sessions, matching the ungroup API's behavior)
    SELECT COUNT(*) INTO remaining_count
    FROM schedule_sessions
    WHERE group_id = OLD.group_id
      AND session_date IS NULL;

    IF remaining_count = 1 THEN
      SELECT id, provider_id, student_id, day_of_week, start_time
      INTO last_template_id, last_provider_id, last_student_id,
           last_day_of_week, last_start_time
      FROM schedule_sessions
      WHERE group_id = OLD.group_id
        AND session_date IS NULL
      LIMIT 1;

      UPDATE schedule_sessions
      SET group_id = NULL,
          group_name = NULL,
          group_color = NULL,
          updated_at = NOW()
      WHERE id = last_template_id;

      UPDATE schedule_sessions
      SET group_id = NULL,
          group_name = NULL,
          group_color = NULL,
          updated_at = NOW()
      WHERE provider_id = last_provider_id
        AND student_id = last_student_id
        AND day_of_week = last_day_of_week
        AND start_time = last_start_time
        AND session_date IS NOT NULL;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trigger_propagate_ungroup_after_delivered_by_change
  ON schedule_sessions;

CREATE TRIGGER trigger_propagate_ungroup_after_delivered_by_change
  AFTER UPDATE OF delivered_by ON schedule_sessions
  FOR EACH ROW
  EXECUTE FUNCTION propagate_ungroup_after_delivered_by_change();

COMMENT ON FUNCTION propagate_ungroup_after_delivered_by_change() IS
  'Propagates template ungrouping (triggered by delivered_by change) to date-specific instances, and ungroups any single-session group orphans that result.';
