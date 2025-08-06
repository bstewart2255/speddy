-- Add school ID columns to profiles table for structured school system
-- These columns will reference the new structured school tables

-- Add columns for structured school IDs
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS state_id VARCHAR(2) REFERENCES states(id),
ADD COLUMN IF NOT EXISTS district_id VARCHAR(20) REFERENCES districts(id),
ADD COLUMN IF NOT EXISTS school_id VARCHAR(20) REFERENCES schools(id);

-- Add backup columns to preserve original text data
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS school_district_original TEXT,
ADD COLUMN IF NOT EXISTS school_site_original TEXT;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_state_id ON profiles(state_id);
CREATE INDEX IF NOT EXISTS idx_profiles_district_id ON profiles(district_id);
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);

-- Create migration tracking table
CREATE TABLE IF NOT EXISTS school_migration_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID REFERENCES profiles(id),
  original_district TEXT,
  original_school TEXT,
  matched_state_id VARCHAR(2),
  matched_district_id VARCHAR(20),
  matched_school_id VARCHAR(20),
  confidence_score FLOAT,
  migration_type VARCHAR(50), -- 'auto', 'manual', 'admin_approved'
  migrated_by UUID REFERENCES profiles(id),
  migrated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  notes TEXT
);

-- Create indexes for migration log
CREATE INDEX IF NOT EXISTS idx_migration_log_profile_id ON school_migration_log(profile_id);
CREATE INDEX IF NOT EXISTS idx_migration_log_migrated_at ON school_migration_log(migrated_at);

-- RLS policies for migration log (admin only)
ALTER TABLE school_migration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin users can view all migration logs" ON school_migration_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin users can insert migration logs" ON school_migration_log
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );