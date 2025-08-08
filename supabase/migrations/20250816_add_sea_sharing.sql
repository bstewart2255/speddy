-- Add shared_at_school field to profiles table to enable school-wide SEA sharing
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS shared_at_school BOOLEAN DEFAULT false;

-- Add index for performance when querying shared SEAs
CREATE INDEX IF NOT EXISTS idx_profiles_shared_at_school 
ON profiles(shared_at_school) 
WHERE shared_at_school = true;

-- Add composite index for efficient school-based SEA queries
CREATE INDEX IF NOT EXISTS idx_profiles_school_sharing 
ON profiles(school_district, school_site, shared_at_school, role) 
WHERE role = 'sea' AND shared_at_school = true;

-- Comment for documentation
COMMENT ON COLUMN profiles.shared_at_school IS 'When true, allows SEA to be assigned sessions by any Resource Specialist at the same school';

-- Create function to validate SEA assignment permissions
CREATE OR REPLACE FUNCTION can_assign_sea_to_session(
  provider_id UUID,
  sea_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
  provider_record RECORD;
  sea_record RECORD;
BEGIN
  -- Get provider details
  SELECT school_district, school_site, role
  INTO provider_record
  FROM profiles
  WHERE id = provider_id;
  
  -- Only Resource Specialists can assign SEAs
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;
  
  -- Get SEA details
  SELECT supervising_provider_id, shared_at_school, school_district, school_site, role
  INTO sea_record
  FROM profiles
  WHERE id = sea_id;
  
  -- Verify it's actually an SEA
  IF sea_record.role != 'sea' THEN
    RETURN FALSE;
  END IF;
  
  -- Check if provider can assign this SEA
  -- Case 1: Provider is the supervising provider
  IF sea_record.supervising_provider_id = provider_id THEN
    RETURN TRUE;
  END IF;
  
  -- Case 2: SEA is shared at school and provider is at the same school
  IF sea_record.shared_at_school = TRUE 
     AND sea_record.school_district = provider_record.school_district 
     AND sea_record.school_site = provider_record.school_site THEN
    RETURN TRUE;
  END IF;
  
  -- Otherwise, no permission
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policy for schedule_sessions to use the new permission model
CREATE POLICY "Resource Specialists can assign sessions to authorized SEAs"
  ON schedule_sessions
  FOR UPDATE
  USING (
    -- User must own the session
    provider_id = auth.uid()
  )
  WITH CHECK (
    -- When assigning to an SEA, check permissions
    CASE 
      WHEN assigned_to_sea_id IS NULL THEN TRUE
      ELSE can_assign_sea_to_session(auth.uid(), assigned_to_sea_id)
    END
  );