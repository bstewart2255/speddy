-- Function to get assignable users for CARE cases at a school
-- Uses SECURITY DEFINER to bypass RLS restrictions on profiles table
CREATE OR REPLACE FUNCTION get_care_assignable_users(p_school_id VARCHAR)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  role TEXT,
  user_type TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Verify the caller has access to this school
  IF NOT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = p_school_id
    UNION
    SELECT 1 FROM provider_schools WHERE provider_id = auth.uid() AND school_id = p_school_id
  ) THEN
    RAISE EXCEPTION 'Access denied: user does not have access to this school';
  END IF;

  RETURN QUERY
  -- Get providers (primary school)
  SELECT DISTINCT
    p.id,
    p.full_name,
    p.role,
    'provider'::TEXT as user_type
  FROM profiles p
  WHERE p.school_id = p_school_id
    AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist', 'sea')

  UNION

  -- Get providers (secondary school via provider_schools)
  SELECT DISTINCT
    p.id,
    p.full_name,
    p.role,
    'provider'::TEXT as user_type
  FROM provider_schools ps
  JOIN profiles p ON p.id = ps.provider_id
  WHERE ps.school_id = p_school_id
    AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist', 'sea')

  UNION

  -- Get site admins
  SELECT DISTINCT
    p.id,
    p.full_name,
    p.role,
    'admin'::TEXT as user_type
  FROM admin_permissions ap
  JOIN profiles p ON p.id = ap.admin_id
  WHERE ap.school_id = p_school_id
    AND ap.role = 'site_admin'

  ORDER BY full_name;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_care_assignable_users(VARCHAR) TO authenticated;

COMMENT ON FUNCTION get_care_assignable_users IS 'Returns providers and site admins who can be assigned to CARE cases at a school';
