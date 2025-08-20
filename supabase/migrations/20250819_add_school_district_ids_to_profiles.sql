-- Add school_id and district_id columns to profiles table if they don't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS school_id TEXT,
ADD COLUMN IF NOT EXISTS district_id TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_district_id ON profiles(district_id);