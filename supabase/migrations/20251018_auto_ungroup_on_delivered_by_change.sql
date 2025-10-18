-- Auto-ungroup sessions when delivered_by changes
--
-- This trigger automatically clears group_id and group_name when a template session's
-- delivered_by field is changed. This ensures that when a session is reassigned to a
-- different deliverer (provider -> SEA, SEA -> specialist, etc.), it is automatically
-- removed from its group since the new deliverer should control their own grouping.

-- Create the trigger function
CREATE OR REPLACE FUNCTION auto_ungroup_on_delivered_by_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-ungroup if:
  -- 1. This is a template session (session_date IS NULL)
  -- 2. The delivered_by field has actually changed
  -- 3. The session was previously in a group
  IF NEW.session_date IS NULL
     AND OLD.delivered_by IS DISTINCT FROM NEW.delivered_by
     AND OLD.group_id IS NOT NULL THEN

    -- Clear the group information
    NEW.group_id := NULL;
    NEW.group_name := NULL;

    -- Log for monitoring
    RAISE NOTICE 'Auto-ungrouped template session % due to delivered_by change from % to %',
      NEW.id, OLD.delivered_by, NEW.delivered_by;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_auto_ungroup_on_delivered_by_change ON schedule_sessions;

CREATE TRIGGER trigger_auto_ungroup_on_delivered_by_change
  BEFORE UPDATE OF delivered_by ON schedule_sessions
  FOR EACH ROW
  EXECUTE FUNCTION auto_ungroup_on_delivered_by_change();

-- Add comment for documentation
COMMENT ON FUNCTION auto_ungroup_on_delivered_by_change() IS
  'Automatically removes template sessions from their group when delivered_by changes';
