-- Migration for JSON-first lesson storage
-- This updates the lessons table to properly store JSON lesson data

-- Add new columns if they don't exist
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS content JSONB,
ADD COLUMN IF NOT EXISTS student_ids UUID[],
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_lessons_content ON lessons USING GIN(content);
CREATE INDEX IF NOT EXISTS idx_lessons_student_ids ON lessons USING GIN(student_ids);
CREATE INDEX IF NOT EXISTS idx_lessons_metadata ON lessons USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_lessons_provider_created ON lessons(provider_id, created_at DESC);

-- Add validation constraint to ensure content is not null for new lessons
ALTER TABLE lessons 
ADD CONSTRAINT lessons_content_not_null 
CHECK (
  created_at < '2025-01-31'::timestamp OR content IS NOT NULL
);

-- Add RLS policies if not exists
DO $$ 
BEGIN
  -- Check if RLS is not enabled
  IF NOT EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE tablename = 'lessons' 
    AND rowsecurity = true
  ) THEN
    ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- Create or replace RLS policies
DROP POLICY IF EXISTS "Users can view their own lessons" ON lessons;
CREATE POLICY "Users can view their own lessons" ON lessons
  FOR SELECT
  USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Users can create their own lessons" ON lessons;
CREATE POLICY "Users can create their own lessons" ON lessons
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Users can update their own lessons" ON lessons;
CREATE POLICY "Users can update their own lessons" ON lessons
  FOR UPDATE
  USING (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Users can delete their own lessons" ON lessons;
CREATE POLICY "Users can delete their own lessons" ON lessons
  FOR DELETE
  USING (auth.uid() = provider_id);

-- Add comment for documentation
COMMENT ON COLUMN lessons.content IS 'JSON structure containing the complete lesson plan, student materials, and metadata';
COMMENT ON COLUMN lessons.student_ids IS 'Array of student IDs included in this lesson';
COMMENT ON COLUMN lessons.metadata IS 'Additional metadata including teacher role, validation status, and generation details';