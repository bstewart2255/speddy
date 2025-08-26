-- Add comprehensive database constraints for specialist assignments
-- This migration ensures data integrity between delivered_by and assignee columns

BEGIN;

-- Add check constraints to enforce the invariants between delivered_by and assignee columns
-- These were identified as missing by code review

-- Drop any existing partial constraints first
ALTER TABLE schedule_sessions 
DROP CONSTRAINT IF EXISTS schedule_sessions_delivered_by_assignee_integrity;

-- Add comprehensive constraint to enforce all invariants
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_delivered_by_assignee_integrity
CHECK (
  -- Valid delivered_by values
  delivered_by IN ('provider', 'sea', 'specialist') AND
  
  -- Provider delivery means no assignees
  (delivered_by != 'provider' OR (assigned_to_sea_id IS NULL AND assigned_to_specialist_id IS NULL)) AND
  
  -- SEA delivery requires SEA assignee and no specialist assignee
  (delivered_by != 'sea' OR (assigned_to_sea_id IS NOT NULL AND assigned_to_specialist_id IS NULL)) AND
  
  -- Specialist delivery requires specialist assignee and no SEA assignee
  (delivered_by != 'specialist' OR (assigned_to_specialist_id IS NOT NULL AND assigned_to_sea_id IS NULL))
);

-- Add foreign key constraints if missing
ALTER TABLE schedule_sessions
DROP CONSTRAINT IF EXISTS schedule_sessions_assigned_to_sea_id_fkey;

ALTER TABLE schedule_sessions
ADD CONSTRAINT schedule_sessions_assigned_to_sea_id_fkey
FOREIGN KEY (assigned_to_sea_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

ALTER TABLE schedule_sessions
DROP CONSTRAINT IF EXISTS schedule_sessions_assigned_to_specialist_id_fkey;

ALTER TABLE schedule_sessions
ADD CONSTRAINT schedule_sessions_assigned_to_specialist_id_fkey
FOREIGN KEY (assigned_to_specialist_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- Create trigger to handle FK ON DELETE SET NULL interaction with CHECK constraint
-- When a specialist or SEA is deleted, we need to update delivered_by to 'provider'
CREATE OR REPLACE FUNCTION handle_assignee_deletion()
RETURNS TRIGGER AS $$
BEGIN
  -- If assigned_to_sea_id was set to NULL by FK cascade, update delivered_by
  IF OLD.assigned_to_sea_id IS NOT NULL AND NEW.assigned_to_sea_id IS NULL THEN
    NEW.delivered_by = 'provider';
  END IF;
  
  -- If assigned_to_specialist_id was set to NULL by FK cascade, update delivered_by
  IF OLD.assigned_to_specialist_id IS NOT NULL AND NEW.assigned_to_specialist_id IS NULL THEN
    NEW.delivered_by = 'provider';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS handle_assignee_deletion_trigger ON schedule_sessions;

-- Create trigger to fire before UPDATE to handle FK cascades
CREATE TRIGGER handle_assignee_deletion_trigger
BEFORE UPDATE ON schedule_sessions
FOR EACH ROW
WHEN (
  (OLD.assigned_to_sea_id IS NOT NULL AND NEW.assigned_to_sea_id IS NULL) OR
  (OLD.assigned_to_specialist_id IS NOT NULL AND NEW.assigned_to_specialist_id IS NULL)
)
EXECUTE FUNCTION handle_assignee_deletion();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_delivered_by 
ON schedule_sessions(delivered_by);

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_sea_assignment 
ON schedule_sessions(assigned_to_sea_id) 
WHERE assigned_to_sea_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_sessions_specialist_assignment 
ON schedule_sessions(assigned_to_specialist_id) 
WHERE assigned_to_specialist_id IS NOT NULL;

-- Add composite index for queries filtering by both delivered_by and assignee
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_delivery_assignment
ON schedule_sessions(delivered_by, assigned_to_sea_id, assigned_to_specialist_id);

COMMIT;