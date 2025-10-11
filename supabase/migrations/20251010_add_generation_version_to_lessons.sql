-- Add generation_version column to lessons table to support template-based worksheet generation
-- v1 = original AI system (full prompt with structure + content)
-- v2 = template-based system (content-only AI prompts + template population)

ALTER TABLE public.lessons
ADD COLUMN IF NOT EXISTS generation_version TEXT DEFAULT 'v1'
CHECK (generation_version IN ('v1', 'v2'));

-- Add index for filtering lessons by generation version
CREATE INDEX IF NOT EXISTS idx_lessons_generation_version
ON public.lessons(generation_version);

-- Add comment to document the column
COMMENT ON COLUMN public.lessons.generation_version IS
'Version of the lesson generation system used: v1 (legacy full-prompt) or v2 (template-based)';
