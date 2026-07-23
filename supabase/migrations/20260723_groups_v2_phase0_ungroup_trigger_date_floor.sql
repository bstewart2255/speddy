-- Groups v2 · Phase 0 (SPE-308) — stop the delegation trigger from rewriting
-- PAST-dated instances when a template's delivered_by changes.
--
-- Background: propagate_ungroup_after_delivered_by_change (20260520_fix_auto_
-- ungroup_propagation.sql) clears group_id/group_name/group_color on EVERY
-- date-specific instance of the ungrouped template — including past ones. That
-- erases the historical group linkage on delivered sessions, which in turn makes
-- the group's past lessons/notes/curriculum unreachable (they authorize via the
-- live group_id). This is the trigger-side twin of the same bug fixed in
-- app/api/sessions/ungroup/route.ts.
--
-- Fix: recreate the AFTER function with a CURRENT_DATE floor on both instance
-- UPDATEs, so only today's and future instances are cleared. Templates
-- (session_date IS NULL) still clear via the BEFORE trigger; past instances keep
-- their group columns. Everything else — the single-session-orphan cleanup, the
-- SECURITY DEFINER context, the search_path pin — is unchanged from 20260520.
--
-- The BEFORE trigger (auto_ungroup_on_delivered_by_change) only mutates the
-- template row (NEW) and needs no change.

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

    -- Propagate ungroup to today's and future date-specific instances only.
    -- Past instances keep their group columns so history stays intact.
    UPDATE schedule_sessions
    SET group_id = NULL,
        group_name = NULL,
        group_color = NULL,
        updated_at = NOW()
    WHERE provider_id = OLD.provider_id
      AND student_id = OLD.student_id
      AND day_of_week = OLD.day_of_week
      AND start_time = OLD.start_time
      AND session_date IS NOT NULL
      AND session_date >= CURRENT_DATE;

    -- If the old group now has only one remaining (live) template, ungroup it
    -- too (groups must have >=2 sessions, matching the ungroup API's behavior).
    -- Soft-deleted templates are excluded so a deleted row can't keep a live
    -- one-member group from auto-dissolving.
    SELECT COUNT(*) INTO remaining_count
    FROM schedule_sessions
    WHERE group_id = OLD.group_id
      AND session_date IS NULL
      AND deleted_at IS NULL;

    IF remaining_count = 1 THEN
      SELECT id, provider_id, student_id, day_of_week, start_time
      INTO last_template_id, last_provider_id, last_student_id,
           last_day_of_week, last_start_time
      FROM schedule_sessions
      WHERE group_id = OLD.group_id
        AND session_date IS NULL
        AND deleted_at IS NULL
      LIMIT 1;

      UPDATE schedule_sessions
      SET group_id = NULL,
          group_name = NULL,
          group_color = NULL,
          updated_at = NOW()
      WHERE id = last_template_id;

      -- Clear only today's and future instances of the last template; past
      -- instances keep their group columns.
      UPDATE schedule_sessions
      SET group_id = NULL,
          group_name = NULL,
          group_color = NULL,
          updated_at = NOW()
      WHERE provider_id = last_provider_id
        AND student_id = last_student_id
        AND day_of_week = last_day_of_week
        AND start_time = last_start_time
        AND session_date IS NOT NULL
        AND session_date >= CURRENT_DATE;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Re-assert the lock-down (CREATE OR REPLACE preserves grants, but keep this
-- migration self-contained and idempotent).
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM anon;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM authenticated;

COMMENT ON FUNCTION propagate_ungroup_after_delivered_by_change() IS
  'Propagates template ungrouping (triggered by delivered_by change) to today+future date-specific instances only (past instances keep their group linkage), and ungroups any single-session group orphans that result.';
