-- Groups v2 · Phase 2 (SPE-311), increment 1 — the delegation triggers must
-- clear group_ref too.
--
-- Phase 1a added schedule_sessions.group_ref and dual-writes it from the
-- group/ungroup ROUTES, but the delivered_by delegation TRIGGERS
-- (auto_ungroup_on_delivered_by_change / propagate_ungroup_after_delivered_by_change)
-- were written before group_ref existed and only clear the legacy
-- group_id/group_name/group_color. So when a grouped session's deliverer changes
-- (it leaves the group), it keeps a stale group_ref pointing at the old group —
-- an inconsistency between the legacy columns and the durable ref.
--
-- Fix: recreate both trigger functions so they also NULL group_ref wherever they
-- clear the legacy columns. Future-only floor + soft-delete exclusion +
-- SECURITY DEFINER lockdown are unchanged from the Phase 0 versions. The
-- one-member auto-dissolve is intentionally LEFT IN this increment — removing it
-- (decision #5, dormant groups) is paired with the Phase 3 UI that renders a
-- dormant group as a plain pill, so it does not ship a "group of one" into the
-- current Day/Week views.

-- BEFORE trigger: clear group_ref on the template row as well.
CREATE OR REPLACE FUNCTION auto_ungroup_on_delivered_by_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL THEN

    NEW.group_id := NULL;
    NEW.group_name := NULL;
    NEW.group_color := NULL;
    NEW.group_ref := NULL;

    RAISE NOTICE 'Auto-ungrouped template session % due to delivered_by change from % to %',
      NEW.id, OLD.delivered_by, NEW.delivered_by;
  END IF;

  RETURN NEW;
END;
$$;

-- AFTER trigger: clear group_ref on the propagated future instances and on the
-- single-remaining-member orphan cleanup, alongside the legacy columns.
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
  IF OLD.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL
     AND NEW.group_id IS NULL THEN

    -- Today's and future instances only (past instances keep their linkage).
    UPDATE schedule_sessions
    SET group_id = NULL, group_name = NULL, group_color = NULL, group_ref = NULL, updated_at = NOW()
    WHERE provider_id = OLD.provider_id
      AND student_id = OLD.student_id
      AND day_of_week = OLD.day_of_week
      AND start_time = OLD.start_time
      AND session_date IS NOT NULL
      AND session_date >= CURRENT_DATE;

    -- One-member orphan cleanup (excludes soft-deleted templates).
    SELECT COUNT(*) INTO remaining_count
    FROM schedule_sessions
    WHERE group_id = OLD.group_id
      AND session_date IS NULL
      AND deleted_at IS NULL;

    IF remaining_count = 1 THEN
      SELECT id, provider_id, student_id, day_of_week, start_time
      INTO last_template_id, last_provider_id, last_student_id, last_day_of_week, last_start_time
      FROM schedule_sessions
      WHERE group_id = OLD.group_id AND session_date IS NULL AND deleted_at IS NULL
      LIMIT 1;

      UPDATE schedule_sessions
      SET group_id = NULL, group_name = NULL, group_color = NULL, group_ref = NULL, updated_at = NOW()
      WHERE id = last_template_id;

      UPDATE schedule_sessions
      SET group_id = NULL, group_name = NULL, group_color = NULL, group_ref = NULL, updated_at = NOW()
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

REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM anon;
REVOKE EXECUTE ON FUNCTION propagate_ungroup_after_delivered_by_change() FROM authenticated;
