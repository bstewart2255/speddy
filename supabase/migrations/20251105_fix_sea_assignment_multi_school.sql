-- Fix SEA assignment permissions for multi-school contexts
--
-- Problem: The current permission function validates based on provider's primary school_id,
-- but in multi-school scenarios, sessions belong to students at different schools.
--
-- Solution: Validate based on the student's school_id instead of provider's primary school.

BEGIN;

-- Update the permission function to check based on student's school
CREATE OR REPLACE FUNCTION can_assign_sea_to_session(
  provider_id UUID,
  sea_id UUID,
  session_id UUID DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
  provider_record RECORD;
  sea_record RECORD;
  student_school_id VARCHAR;
  provider_works_at_school BOOLEAN;
  sea_works_at_school BOOLEAN;
BEGIN
  -- Get provider details
  SELECT school_district, school_site, school_id, role
  INTO provider_record
  FROM profiles
  WHERE id = provider_id;

  -- Only Resource Specialists can assign SEAs
  IF provider_record.role != 'resource' THEN
    RETURN FALSE;
  END IF;

  -- Get SEA details
  SELECT school_district, school_site, school_id, role
  INTO sea_record
  FROM profiles
  WHERE id = sea_id;

  -- Verify it's actually an SEA
  IF sea_record.role != 'sea' THEN
    RETURN FALSE;
  END IF;

  -- If session_id is provided, validate based on student's school
  IF session_id IS NOT NULL THEN
    -- Get the student's school_id from the session
    SELECT s.school_id
    INTO student_school_id
    FROM schedule_sessions ss
    JOIN students s ON ss.student_id = s.id
    WHERE ss.id = session_id;

    -- If we found a student school_id, check if both provider and SEA work at that school
    IF student_school_id IS NOT NULL THEN
      -- Check if provider works at this school
      -- First check if it's their primary school
      provider_works_at_school := (provider_record.school_id = student_school_id);

      -- If not primary, check provider_schools table
      IF NOT provider_works_at_school THEN
        provider_works_at_school := EXISTS (
          SELECT 1
          FROM provider_schools ps
          WHERE ps.provider_id = can_assign_sea_to_session.provider_id
          AND ps.school_id = student_school_id
        );
      END IF;

      -- Check if SEA works at this school
      -- First check if it's their primary school
      sea_works_at_school := (sea_record.school_id = student_school_id);

      -- If not primary, check provider_schools table
      IF NOT sea_works_at_school THEN
        sea_works_at_school := EXISTS (
          SELECT 1
          FROM provider_schools ps
          WHERE ps.provider_id = can_assign_sea_to_session.sea_id
          AND ps.school_id = student_school_id
        );
      END IF;

      -- Both must work at the student's school
      IF provider_works_at_school AND sea_works_at_school THEN
        RETURN TRUE;
      ELSE
        RETURN FALSE;
      END IF;
    END IF;

    -- If student has no school_id, fall through to legacy matching
  END IF;

  -- Fallback: Check if they're at the same school (legacy behavior for backward compatibility)
  -- Prefer school_id matching if available (migrated schools)
  IF provider_record.school_id IS NOT NULL AND sea_record.school_id IS NOT NULL THEN
    IF provider_record.school_id = sea_record.school_id THEN
      RETURN TRUE;
    END IF;
  -- Fallback to legacy school_district + school_site matching if either school_id is NULL
  ELSIF provider_record.school_district IS NOT NULL AND provider_record.school_site IS NOT NULL THEN
    IF provider_record.school_district = sea_record.school_district
       AND provider_record.school_site = sea_record.school_site THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- Not at the same school
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update the comment to reflect the new behavior
COMMENT ON FUNCTION can_assign_sea_to_session(UUID, UUID, UUID) IS
'Validates that a Resource Specialist can assign a session to an SEA.
Returns TRUE if:
1. Provider has role=resource
2. SEA has role=sea
3. Both work at the student''s school (checked via profiles.school_id or provider_schools table)

When session_id is provided, validates based on the student''s school.
When session_id is NULL, falls back to checking if provider and SEA share the same primary school (legacy behavior).
Supports multi-school scenarios where provider/SEA work at multiple schools.';

-- Update the trigger function to pass session_id
CREATE OR REPLACE FUNCTION validate_session_assignment_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only validate if assignment fields are actually changing
  -- Check SEA assignment permission only if it's being changed
  IF NEW.assigned_to_sea_id IS DISTINCT FROM OLD.assigned_to_sea_id THEN
    IF NEW.assigned_to_sea_id IS NOT NULL THEN
      -- Validate the new SEA assignment, passing the session_id
      IF NOT can_assign_sea_to_session(auth.uid(), NEW.assigned_to_sea_id, NEW.id) THEN
        RAISE EXCEPTION 'You do not have permission to assign this SEA to the session';
      END IF;
    END IF;
  END IF;

  -- Check specialist assignment permission only if it's being changed
  IF NEW.assigned_to_specialist_id IS DISTINCT FROM OLD.assigned_to_specialist_id THEN
    IF NEW.assigned_to_specialist_id IS NOT NULL THEN
      -- Validate the new specialist assignment
      IF NOT can_assign_specialist_to_session(auth.uid(), NEW.assigned_to_specialist_id) THEN
        RAISE EXCEPTION 'You do not have permission to assign this specialist to the session';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION validate_session_assignment_permissions IS
'Validates that users have permission to assign SEAs and specialists to sessions.
Runs with SECURITY DEFINER to bypass RLS and prevent recursion.
Only validates when assignment fields are actually changing.
Passes session_id to permission checks for multi-school support.';

COMMIT;
