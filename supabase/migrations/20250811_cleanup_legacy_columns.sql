-- CLEANUP LEGACY SCHOOL COLUMNS
-- This migration removes text-based school columns after ensuring all data is migrated
-- IMPORTANT: Run 20250810_backup_legacy_school_data.sql FIRST!

-- First, ensure all users are migrated (this will fail if not ready)
DO $$
DECLARE
  unmigrated_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmigrated_count
  FROM profiles
  WHERE school_id IS NULL 
    AND school_site IS NOT NULL;
    
  IF unmigrated_count > 0 THEN
    RAISE EXCEPTION 'Cannot proceed with cleanup: % unmigrated users remain', unmigrated_count;
  END IF;
END $$;

-- Drop old text-based columns from profiles
ALTER TABLE profiles 
  DROP COLUMN IF EXISTS school_district_original,
  DROP COLUMN IF EXISTS school_site_original;

-- For now, keep school_district and school_site for display purposes
-- but make school_id, district_id, state_id required for new records
ALTER TABLE profiles
  ALTER COLUMN school_id SET NOT NULL,
  ALTER COLUMN district_id SET NOT NULL,
  ALTER COLUMN state_id SET NOT NULL;

-- Update students table
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS school_id VARCHAR(20) REFERENCES schools(id);

-- Migrate students school data if not already done
UPDATE students s
SET school_id = p.school_id
FROM profiles p
WHERE s.provider_id = p.id
  AND s.school_id IS NULL
  AND p.school_id IS NOT NULL;

-- Make school_id required for students
ALTER TABLE students
  ALTER COLUMN school_id SET NOT NULL;

-- Update bell_schedules table
ALTER TABLE bell_schedules
  ADD COLUMN IF NOT EXISTS school_id VARCHAR(20) REFERENCES schools(id);

-- Migrate bell_schedules school data if not already done
UPDATE bell_schedules b
SET school_id = p.school_id
FROM profiles p
WHERE b.provider_id = p.id
  AND b.school_id IS NULL
  AND p.school_id IS NOT NULL;

-- Make school_id required for bell_schedules
ALTER TABLE bell_schedules
  ALTER COLUMN school_id SET NOT NULL;

-- Drop the provider_schools table (replaced by structured data)
DROP TABLE IF EXISTS provider_schools CASCADE;

-- Create new indexes for better performance
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_bell_schedules_school_id ON bell_schedules(school_id);

-- Create composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_profiles_school_district_state 
  ON profiles(school_id, district_id, state_id);

CREATE INDEX IF NOT EXISTS idx_students_provider_school 
  ON students(provider_id, school_id);

-- Drop old text-based indexes
DROP INDEX IF EXISTS idx_profiles_school_district;
DROP INDEX IF EXISTS idx_profiles_school_site;
DROP INDEX IF EXISTS idx_students_school_district;
DROP INDEX IF EXISTS idx_students_school_site;

-- Update RLS policies to use structured columns
-- Drop old policies
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- Create new simplified policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Create policy for team member visibility based on school_id
CREATE POLICY "Users can view team members in same school" ON profiles
  FOR SELECT USING (
    school_id IN (
      SELECT school_id 
      FROM profiles 
      WHERE id = auth.uid()
    )
  );

-- Add migration completion marker
CREATE TABLE IF NOT EXISTS migration_markers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  migration_name TEXT UNIQUE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

INSERT INTO migration_markers (migration_name, notes)
VALUES (
  'legacy_school_cleanup_v1',
  'Removed legacy text-based school columns, enforced structured data requirements'
);