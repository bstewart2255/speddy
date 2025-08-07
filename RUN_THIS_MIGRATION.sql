-- TEACHER DETAILS FEATURE MIGRATION
-- Run this entire script in Supabase SQL Editor
-- https://supabase.com/dashboard/project/qkcruccytmmdajfavpgb/sql/new

-- ============================================
-- STEP 1: Create teachers table
-- ============================================
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  classroom_number TEXT,
  phone_number TEXT,
  provider_id UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_teachers_provider_id ON teachers(provider_id);
CREATE INDEX IF NOT EXISTS idx_teachers_email ON teachers(email);
CREATE INDEX IF NOT EXISTS idx_teachers_name ON teachers(first_name, last_name);

-- Add RLS policies
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Users can view teachers for their provider
CREATE POLICY "Users can view teachers for their provider" ON teachers
  FOR SELECT USING (provider_id = auth.uid());

-- Users can insert teachers for their provider
CREATE POLICY "Users can insert teachers for their provider" ON teachers
  FOR INSERT WITH CHECK (provider_id = auth.uid());

-- Users can update teachers for their provider
CREATE POLICY "Users can update teachers for their provider" ON teachers
  FOR UPDATE USING (provider_id = auth.uid());

-- Users can delete teachers for their provider
CREATE POLICY "Users can delete teachers for their provider" ON teachers
  FOR DELETE USING (provider_id = auth.uid());

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_teachers_updated_at ON teachers;
CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- STEP 2: Add teacher_id to students table
-- ============================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES teachers(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_students_teacher_id ON students(teacher_id);

-- ============================================
-- STEP 3: Migrate existing teacher data
-- ============================================

-- Create teachers from unique teacher names per provider
INSERT INTO teachers (first_name, last_name, provider_id)
SELECT DISTINCT ON (teacher_name, provider_id)
  CASE 
    WHEN position(' ' in teacher_name) > 0 
    THEN left(teacher_name, position(' ' in teacher_name) - 1)
    ELSE NULL
  END as first_name,
  CASE 
    WHEN position(' ' in teacher_name) > 0 
    THEN substring(teacher_name from position(' ' in teacher_name) + 1)
    ELSE teacher_name
  END as last_name,
  provider_id
FROM students
WHERE teacher_name IS NOT NULL 
  AND teacher_name != ''
  AND NOT EXISTS (
    SELECT 1 FROM teachers t 
    WHERE (
      (t.first_name = CASE 
        WHEN position(' ' in students.teacher_name) > 0 
        THEN left(students.teacher_name, position(' ' in students.teacher_name) - 1)
        ELSE NULL
      END
      AND t.last_name = CASE 
        WHEN position(' ' in students.teacher_name) > 0 
        THEN substring(students.teacher_name from position(' ' in students.teacher_name) + 1)
        ELSE students.teacher_name
      END)
      OR (t.last_name = students.teacher_name AND t.first_name IS NULL)
    )
    AND t.provider_id = students.provider_id
  );

-- Update students with teacher_id
UPDATE students s
SET teacher_id = t.id
FROM teachers t
WHERE s.provider_id = t.provider_id
  AND s.teacher_name IS NOT NULL
  AND s.teacher_id IS NULL
  AND (
    -- Match full name
    (t.first_name || ' ' || t.last_name = s.teacher_name)
    OR 
    -- Match last name only (for single-word teacher names)
    (t.last_name = s.teacher_name AND t.first_name IS NULL)
    OR
    -- Match when teacher has first and last name
    (
      t.first_name = CASE 
        WHEN position(' ' in s.teacher_name) > 0 
        THEN left(s.teacher_name, position(' ' in s.teacher_name) - 1)
        ELSE NULL
      END
      AND t.last_name = CASE 
        WHEN position(' ' in s.teacher_name) > 0 
        THEN substring(s.teacher_name from position(' ' in s.teacher_name) + 1)
        ELSE s.teacher_name
      END
    )
  );

-- ============================================
-- STEP 4: Verify migration results
-- ============================================
DO $$
DECLARE
  teachers_created INTEGER;
  students_updated INTEGER;
  students_without_teacher_id INTEGER;
BEGIN
  SELECT COUNT(*) INTO teachers_created FROM teachers;
  SELECT COUNT(*) INTO students_updated FROM students WHERE teacher_id IS NOT NULL;
  SELECT COUNT(*) INTO students_without_teacher_id FROM students WHERE teacher_id IS NULL AND teacher_name IS NOT NULL AND teacher_name != '';
  
  RAISE NOTICE '✅ Migration completed: % teachers created, % students updated with teacher_id', teachers_created, students_updated;
  
  IF students_without_teacher_id > 0 THEN
    RAISE WARNING '⚠️  % students still have teacher_name but no teacher_id', students_without_teacher_id;
  END IF;
END $$;

-- ============================================
-- Migration Complete!
-- The Teacher Details feature is now ready to use.
-- ============================================