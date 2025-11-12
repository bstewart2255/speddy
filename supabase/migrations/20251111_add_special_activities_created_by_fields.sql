-- Add created_by fields to special_activities table for teacher portal
-- This allows tracking whether a special activity was created by a teacher or resource specialist

-- Add created_by fields to special_activities table
ALTER TABLE public.special_activities
ADD COLUMN IF NOT EXISTS created_by_role text,
ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public.profiles(id);

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_special_activities_created_by
ON public.special_activities(created_by_id, created_by_role);

-- Backfill existing records (all created by resource specialists)
UPDATE public.special_activities
SET created_by_role = 'resource',
    created_by_id = provider_id
WHERE created_by_role IS NULL;

-- Add comments
COMMENT ON COLUMN public.special_activities.created_by_role IS 'Role of user who created this activity (resource or teacher)';
COMMENT ON COLUMN public.special_activities.created_by_id IS 'User ID who created this activity';
