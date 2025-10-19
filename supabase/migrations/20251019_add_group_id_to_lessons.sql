-- Add group_id field to lessons table to support group-level lesson plans

-- Add the group_id column (nullable, as not all lessons are group-level)
ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS group_id UUID;

-- Add index for efficient querying of group lessons
CREATE INDEX IF NOT EXISTS idx_lessons_group_id ON public.lessons(group_id);

-- Add a check constraint to ensure lesson_source consistency
-- Group lessons should be marked appropriately
COMMENT ON COLUMN public.lessons.group_id IS 'References schedule_sessions.group_id for group-level lessons. When set, this lesson applies to all sessions in the group.';

-- Note: We don't add a foreign key constraint to schedule_sessions.group_id
-- because group_id is not a separate table - it's a field in schedule_sessions
-- that groups multiple sessions together. Multiple sessions can share the same group_id.
