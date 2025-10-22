-- Create atomic function for importing a student with details
-- This ensures both student and student_details records are created in a single transaction
-- Prevents orphaned student records if student_details insert fails

CREATE OR REPLACE FUNCTION public.import_student_atomic(
  p_provider_id uuid,
  p_initials text,
  p_grade_level text,
  p_school_site text DEFAULT NULL,
  p_school_id text DEFAULT NULL,
  p_district_id text DEFAULT NULL,
  p_state_id text DEFAULT NULL,
  p_first_name text DEFAULT NULL,
  p_last_name text DEFAULT NULL,
  p_iep_goals text[] DEFAULT NULL
)
RETURNS TABLE (
  student_id uuid,
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
BEGIN
  -- Insert student record
  INSERT INTO public.students (
    provider_id,
    initials,
    grade_level,
    school_site,
    school_id,
    district_id,
    state_id
  )
  VALUES (
    p_provider_id,
    p_initials,
    p_grade_level,
    p_school_site,
    p_school_id,
    p_district_id,
    p_state_id
  )
  RETURNING id INTO v_student_id;

  -- Insert student_details record
  INSERT INTO public.student_details (
    student_id,
    first_name,
    last_name,
    iep_goals
  )
  VALUES (
    v_student_id,
    p_first_name,
    p_last_name,
    p_iep_goals
  );

  -- Return success
  RETURN QUERY SELECT v_student_id, true, NULL::text;

EXCEPTION
  WHEN OTHERS THEN
    -- If any error occurs, the transaction is automatically rolled back
    -- Return the error information
    RETURN QUERY SELECT NULL::uuid, false, SQLERRM;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.import_student_atomic IS
  'Atomically creates a student and student_details record in a single transaction. Used by bulk import to prevent orphaned records.';

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.import_student_atomic TO authenticated;
