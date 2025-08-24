-- Fix data consistency for specialist assignments
-- This migration cleans up any inconsistent data and adds enhanced constraints

-- Step 1: Clean up any existing inconsistent data
-- Convert any rows with delivered_by='specialist' but NULL assigned_to_specialist_id back to 'provider'
UPDATE schedule_sessions 
SET delivered_by = 'provider' 
WHERE delivered_by = 'specialist' AND assigned_to_specialist_id IS NULL;

-- Also ensure SEA assignments are consistent
UPDATE schedule_sessions 
SET delivered_by = 'provider' 
WHERE delivered_by = 'sea' AND assigned_to_sea_id IS NULL;

-- Step 2: Drop the old constraint if it exists
ALTER TABLE schedule_sessions 
DROP CONSTRAINT IF EXISTS schedule_sessions_delivered_by_check;

-- Step 3: Add enhanced check constraint that enforces assignment consistency
-- This ensures:
-- 1. delivered_by can only be 'provider', 'sea', or 'specialist'
-- 2. If delivered_by='specialist', then assigned_to_specialist_id must NOT be NULL
-- 3. If delivered_by='sea', then assigned_to_sea_id must NOT be NULL
ALTER TABLE schedule_sessions 
ADD CONSTRAINT schedule_sessions_delivered_by_check 
CHECK (
  delivered_by IN ('provider', 'sea', 'specialist') 
  AND (delivered_by != 'specialist' OR assigned_to_specialist_id IS NOT NULL)
  AND (delivered_by != 'sea' OR assigned_to_sea_id IS NOT NULL)
);
