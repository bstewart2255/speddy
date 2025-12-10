-- Create a SECURITY DEFINER function to fetch SEA profiles at a given school
-- This bypasses RLS to allow specialists to see SEAs at their school
-- Fixes GitHub issues #446 and #447

CREATE OR REPLACE FUNCTION public.get_school_seas(
  p_school_id varchar DEFAULT NULL,
  p_school_site varchar DEFAULT NULL,
  p_school_district varchar DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  full_name text,
  supervising_provider_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  -- Only allow authenticated users
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Return SEAs at the specified school
  IF p_school_id IS NOT NULL THEN
    RETURN QUERY
    SELECT p.id, p.full_name, p.supervising_provider_id
    FROM profiles p
    WHERE p.role = 'sea'
      AND p.school_id = p_school_id
    ORDER BY p.full_name;
  ELSE
    -- Legacy: filter by school_site and district
    RETURN QUERY
    SELECT p.id, p.full_name, p.supervising_provider_id
    FROM profiles p
    WHERE p.role = 'sea'
      AND p.school_site = p_school_site
      AND p.school_district = p_school_district
    ORDER BY p.full_name;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
REVOKE ALL ON FUNCTION public.get_school_seas(varchar, varchar, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_school_seas(varchar, varchar, varchar) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.get_school_seas(varchar, varchar, varchar) IS
'Returns SEA profiles at a given school. Uses SECURITY DEFINER to bypass RLS,
allowing specialists to see SEAs at their school for session assignment.';
