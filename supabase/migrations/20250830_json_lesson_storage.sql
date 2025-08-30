-- Migration for JSON-first lesson storage
-- This updates the lessons table to properly store JSON lesson data

-- First, handle the content column - it exists as text, we need to convert it to JSONB
-- We'll rename the old column and create a new one
ALTER TABLE lessons 
RENAME COLUMN content TO content_old_text;

ALTER TABLE lessons 
ADD COLUMN content JSONB;

-- Add metadata column if it doesn't exist
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS metadata JSONB;

-- Make some old required columns nullable for new JSON-based lessons
ALTER TABLE lessons 
ALTER COLUMN time_slot DROP NOT NULL,
ALTER COLUMN student_details DROP NOT NULL,
ALTER COLUMN lesson_date DROP NOT NULL,
ALTER COLUMN content_old_text DROP NOT NULL;

-- Add new columns for better organization (optional, with defaults)
ALTER TABLE lessons
ADD COLUMN IF NOT EXISTS lesson_type TEXT,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS topic TEXT,
ADD COLUMN IF NOT EXISTS duration INTEGER;

-- Note: student_ids already exists as a text array, so we don't need to add it

-- Add indexes for performance
-- JSONB columns use GIN indexes directly
CREATE INDEX IF NOT EXISTS idx_lessons_content ON lessons USING GIN(content);
CREATE INDEX IF NOT EXISTS idx_lessons_metadata ON lessons USING GIN(metadata);
-- Text array can use GIN index
CREATE INDEX IF NOT EXISTS idx_lessons_student_ids ON lessons USING GIN(student_ids);
-- Regular btree index for provider and timestamp
CREATE INDEX IF NOT EXISTS idx_lessons_provider_created ON lessons(provider_id, created_at DESC);

-- Note: Not adding a content constraint to avoid issues with existing data
-- New lessons will use the 'content' JSONB column
-- Old lessons will still have data in 'content_old_text'

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
    ALTER TABLE lessons FORCE ROW LEVEL SECURITY;
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
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

DROP POLICY IF EXISTS "Users can delete their own lessons" ON lessons;
CREATE POLICY "Users can delete their own lessons" ON lessons
  FOR DELETE
  USING (auth.uid() = provider_id);

-- Add comment for documentation
COMMENT ON COLUMN lessons.content IS 'JSON structure containing the complete lesson plan, student materials, and metadata';
COMMENT ON COLUMN lessons.student_ids IS 'Array of student IDs included in this lesson';
COMMENT ON COLUMN lessons.metadata IS 'Additional metadata including teacher role, validation status, and generation details';