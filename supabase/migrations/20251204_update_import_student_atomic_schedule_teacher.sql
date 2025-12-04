-- Update import_student_atomic function to support schedule and teacher assignment
-- Adds optional parameters for sessions_per_week, minutes_per_session, and teacher_id

-- Drop the existing function with the old signature first
DROP FUNCTION IF EXISTS public.import_student_atomic(
  uuid, text, text, text, text, text, text, text, text, text[]
);

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
  p_iep_goals text[] DEFAULT NULL,
  p_sessions_per_week integer DEFAULT NULL,
  p_minutes_per_session integer DEFAULT NULL,
  p_teacher_id uuid DEFAULT NULL
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
  -- Insert student record with optional schedule and teacher fields
  INSERT INTO public.students (
    provider_id,
    initials,
    grade_level,
    school_site,
    school_id,
    district_id,
    state_id,
    sessions_per_week,
    minutes_per_session,
    teacher_id
  )
  VALUES (
    p_provider_id,
    p_initials,
    p_grade_level,
    p_school_site,
    p_school_id,
    p_district_id,
    p_state_id,
    p_sessions_per_week,
    p_minutes_per_session,
    p_teacher_id
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

-- Update comment (must specify full signature)
COMMENT ON FUNCTION public.import_student_atomic(
  uuid, text, text, text, text, text, text, text, text, text[], integer, integer, uuid
) IS
  'Atomically creates a student and student_details record in a single transaction. Supports optional schedule (sessions_per_week, minutes_per_session) and teacher assignment. Used by bulk import to prevent orphaned records.';
