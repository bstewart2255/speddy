-- Fix data consistency for specialist assignments
-- This migration cleans up any inconsistent data and adds enhanced constraints

BEGIN; -- Wrap in transaction for atomic application

-- Step 1: Comprehensive data cleanup
-- Handle all inconsistent states before adding constraints

-- Fix specialist assignments with missing assignee
UPDATE schedule_sessions 
SET delivered_by = 'provider', 
    assigned_to_specialist_id = NULL
WHERE delivered_by = 'specialist' AND assigned_to_specialist_id IS NULL;

-- Fix SEA assignments with missing assignee
UPDATE schedule_sessions 
SET delivered_by = 'provider',
    assigned_to_sea_id = NULL
WHERE delivered_by = 'sea' AND assigned_to_sea_id IS NULL;

-- Normalize based on non-null assignee IDs when delivered_by is inconsistent
UPDATE schedule_sessions
SET delivered_by = 'specialist'
WHERE assigned_to_specialist_id IS NOT NULL AND delivered_by != 'specialist';

UPDATE schedule_sessions
SET delivered_by = 'sea'
WHERE assigned_to_sea_id IS NOT NULL AND delivered_by != 'sea';

-- Clear stale assignee IDs when delivered_by='provider'
UPDATE schedule_sessions
SET assigned_to_sea_id = NULL,
    assigned_to_specialist_id = NULL
WHERE delivered_by = 'provider' AND (assigned_to_sea_id IS NOT NULL OR assigned_to_specialist_id IS NOT NULL);

-- Handle edge case: both assignees set (should never happen, but clean it up)
-- Prefer specialist over SEA if both are set
UPDATE schedule_sessions
SET assigned_to_sea_id = NULL,
    delivered_by = 'specialist'
WHERE assigned_to_specialist_id IS NOT NULL AND assigned_to_sea_id IS NOT NULL;

-- Step 2: Drop existing constraints
ALTER TABLE schedule_sessions 
DROP CONSTRAINT IF EXISTS schedule_sessions_delivered_by_check;

ALTER TABLE schedule_sessions 
DROP CONSTRAINT IF EXISTS schedule_sessions_assignment_exclusivity;

ALTER TABLE schedule_sessions 
DROP CONSTRAINT IF EXISTS schedule_sessions_provider_no_assignees;

-- Step 3: Add comprehensive check constraints with clear names
-- These enforce strict invariants between delivered_by and assignee columns

-- Constraint 1: Ensure delivered_by values are valid
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_delivered_by_valid
CHECK (delivered_by IN ('provider', 'sea', 'specialist'));

-- Constraint 2: If specialist delivery, must have specialist assignee
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_specialist_requires_assignee
CHECK (delivered_by != 'specialist' OR assigned_to_specialist_id IS NOT NULL);

-- Constraint 3: If SEA delivery, must have SEA assignee
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_sea_requires_assignee
CHECK (delivered_by != 'sea' OR assigned_to_sea_id IS NOT NULL);

-- Constraint 4: Provider delivery means no assignees
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_provider_no_assignees
CHECK (delivered_by != 'provider' OR (assigned_to_sea_id IS NULL AND assigned_to_specialist_id IS NULL));

-- Constraint 5: At most one assignee (exclusivity)
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_assignment_exclusivity
CHECK (NOT (assigned_to_sea_id IS NOT NULL AND assigned_to_specialist_id IS NOT NULL));

-- Add foreign key constraints if they don't exist
ALTER TABLE schedule_sessions
DROP CONSTRAINT IF EXISTS schedule_sessions_assigned_to_specialist_id_fkey;

ALTER TABLE schedule_sessions
ADD CONSTRAINT schedule_sessions_assigned_to_specialist_id_fkey
FOREIGN KEY (assigned_to_specialist_id) 
REFERENCES profiles(id) 
ON DELETE SET NULL;

-- Add index for performance on specialist lookups
CREATE INDEX IF NOT EXISTS idx_schedule_sessions_specialist_assignment 
ON schedule_sessions(assigned_to_specialist_id) 
WHERE assigned_to_specialist_id IS NOT NULL;

COMMIT;