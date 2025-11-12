-- Add missing foreign key constraint for special_activities.teacher_id
-- This constraint ensures referential integrity between special_activities and teachers

-- First, ensure any invalid teacher_id values are set to NULL
UPDATE public.special_activities
SET teacher_id = NULL
WHERE teacher_id IS NOT NULL
  AND teacher_id NOT IN (SELECT id FROM public.teachers);

-- Add the foreign key constraint (only if it doesn't already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'special_activities_teacher_id_fkey'
  ) THEN
    ALTER TABLE public.special_activities
    ADD CONSTRAINT special_activities_teacher_id_fkey
    FOREIGN KEY (teacher_id)
    REFERENCES public.teachers(id)
    ON DELETE SET NULL;
  END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_special_activities_teacher_id
ON public.special_activities(teacher_id)
WHERE teacher_id IS NOT NULL;

COMMENT ON CONSTRAINT special_activities_teacher_id_fkey ON public.special_activities
IS 'Links special activities to teacher records. When a teacher is deleted, the reference is set to NULL.';
