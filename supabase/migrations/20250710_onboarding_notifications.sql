-- Migration: Add onboarding notification support
-- Date: 2025-07-10
-- Description: Ensures profiles table has works_at_multiple_schools column for onboarding notifications

-- Add works_at_multiple_schools column if it doesn't exist
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS works_at_multiple_schools BOOLEAN DEFAULT false;

-- Comment for documentation
COMMENT ON COLUMN profiles.works_at_multiple_schools IS 'Indicates if the provider works at multiple school sites';
