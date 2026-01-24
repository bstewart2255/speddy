-- Migration: Add template_id and is_template columns to schedule_sessions
-- Purpose: Enable explicit template→instance relationships and simplify template detection

-- Add is_template column with computed default
ALTER TABLE schedule_sessions
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT false;

-- Add template_id column to link instances to their source template
ALTER TABLE schedule_sessions
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES schedule_sessions(id) ON DELETE SET NULL;

-- Create index on template_id for efficient lookups
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_template_id ON schedule_sessions(template_id);

-- Create index on is_template for filtering
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_is_template ON schedule_sessions(is_template);

-- Backfill is_template based on session_date
-- Templates have session_date = NULL, instances have a date
UPDATE schedule_sessions
SET is_template = (session_date IS NULL)
WHERE is_template IS NULL OR is_template != (session_date IS NULL);

-- Backfill template_id for existing instances by matching to templates
-- Match on all relevant fields: student_id, provider_id, day_of_week, start_time, end_time, service_type, group_id
-- Only for instances (session_date IS NOT NULL) that don't already have a template_id
-- Uses ORDER BY created_at DESC to prefer the most recent template when there are duplicates
UPDATE schedule_sessions AS instance
SET template_id = (
    SELECT t.id
    FROM schedule_sessions t
    WHERE t.session_date IS NULL  -- Template
      AND t.student_id = instance.student_id
      AND t.provider_id = instance.provider_id
      AND t.day_of_week = instance.day_of_week
      AND t.start_time = instance.start_time
      AND t.end_time = instance.end_time
      AND t.service_type = instance.service_type
      AND (t.group_id = instance.group_id OR (t.group_id IS NULL AND instance.group_id IS NULL))
    ORDER BY t.created_at DESC NULLS LAST
    LIMIT 1
)
WHERE instance.session_date IS NOT NULL  -- Only instances
  AND instance.template_id IS NULL;       -- Only if not already set

-- Report: Count instances that could not be linked to a template
-- This helps identify any orphaned instances for manual review
DO $$
DECLARE
    unlinked_count INTEGER;
    total_instances INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_instances 
    FROM schedule_sessions 
    WHERE session_date IS NOT NULL;
    
    SELECT COUNT(*) INTO unlinked_count 
    FROM schedule_sessions 
    WHERE session_date IS NOT NULL AND template_id IS NULL;
    
    IF unlinked_count > 0 THEN
        RAISE NOTICE 'Backfill complete: % of % instances linked. % instances could not be matched to a template.', 
            total_instances - unlinked_count, total_instances, unlinked_count;
    ELSE
        RAISE NOTICE 'Backfill complete: All % instances successfully linked to templates.', total_instances;
    END IF;
END $$;

-- Add a comment explaining the columns
COMMENT ON COLUMN schedule_sessions.is_template IS 'True for template sessions (Main Schedule), false for instances (Plan/Dashboard)';
COMMENT ON COLUMN schedule_sessions.template_id IS 'References the source template session for instances';

-- Create a trigger to automatically set is_template based on session_date
-- This ensures consistency for all future inserts/updates
CREATE OR REPLACE FUNCTION sync_is_template()
RETURNS TRIGGER AS $$
BEGIN
    NEW.is_template := (NEW.session_date IS NULL);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_is_template ON schedule_sessions;
CREATE TRIGGER trigger_sync_is_template
    BEFORE INSERT OR UPDATE OF session_date ON schedule_sessions
    FOR EACH ROW
    EXECUTE FUNCTION sync_is_template();
