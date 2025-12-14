-- Migration: Add creator tracking to bell_schedules
-- This enables site admins to create bell schedules while tracking who created each entry
-- Only the creator can delete their own entries (like special_activities pattern)

-- Add creator tracking columns
ALTER TABLE bell_schedules
ADD COLUMN IF NOT EXISTS created_by_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS created_by_role TEXT CHECK (created_by_role IN ('provider', 'site_admin'));

-- Index for performance when filtering by creator
CREATE INDEX IF NOT EXISTS idx_bell_schedules_created_by
ON bell_schedules(created_by_id, created_by_role);

-- Backfill existing records (all are provider-created)
UPDATE bell_schedules
SET created_by_id = provider_id,
    created_by_role = 'provider'
WHERE created_by_id IS NULL AND provider_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN bell_schedules.created_by_id IS 'User ID who created this bell schedule entry';
COMMENT ON COLUMN bell_schedules.created_by_role IS 'Role of the user who created this entry: provider or site_admin';
