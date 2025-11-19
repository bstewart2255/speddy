-- Add soft delete support to special_activities table
--
-- This migration adds a deleted_at timestamp column to enable soft deletes,
-- preventing accidental permanent data loss while maintaining data integrity
-- for school-wide special activities.

-- Add deleted_at column
ALTER TABLE public.special_activities
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for performance when filtering out deleted records
CREATE INDEX IF NOT EXISTS idx_special_activities_deleted_at
ON public.special_activities(deleted_at)
WHERE deleted_at IS NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.special_activities.deleted_at IS
'Timestamp when the activity was soft-deleted. NULL means active. Soft-deleted records can be restored within retention period.';
