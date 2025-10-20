-- Add group_id field to lessons table to support group-level lesson plans

-- Add the group_id column (nullable, as not all lessons are group-level)
ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS group_id UUID;

-- Add index for efficient querying of group lessons
CREATE INDEX IF NOT EXISTS idx_lessons_group_id ON public.lessons(group_id);

-- Ensure group_id uniqueness: each group can only have one lesson
-- Use a transaction to safely drop old constraint (if exists) and add unique index
DO $$
BEGIN
  -- Drop the old CHECK constraint if it exists (from previous migration version)
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'lessons_group_id_lesson_source_check'
  ) THEN
    ALTER TABLE public.lessons
    DROP CONSTRAINT lessons_group_id_lesson_source_check;
  END IF;
END $$;

-- Add partial unique index to enforce one lesson per group_id
-- Partial index only includes rows where group_id IS NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS idx_lessons_group_id_unique
  ON public.lessons(group_id)
  WHERE group_id IS NOT NULL;

COMMENT ON COLUMN public.lessons.group_id IS 'References schedule_sessions.group_id for group-level lessons. When set, this lesson applies to all sessions in the group.';

-- Note: We don't add a foreign key constraint to schedule_sessions.group_id
-- because group_id is not a separate table - it's a field in schedule_sessions
-- that groups multiple sessions together. Multiple sessions can share the same group_id.
