-- Function to get sign-in logs from auth.audit_log_entries
-- This is needed because the auth schema isn't directly accessible via PostgREST
CREATE OR REPLACE FUNCTION public.get_sign_in_logs(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  provider TEXT,
  ip_address TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    (a.payload->>'actor_id')::UUID as user_id,
    a.payload->>'actor_username' as email,
    COALESCE(a.payload->>'actor_name', p.full_name) as full_name,
    p.role,
    COALESCE(a.payload->'traits'->>'provider', 'email') as provider,
    a.ip_address::TEXT,
    a.created_at
  FROM auth.audit_log_entries a
  LEFT JOIN public.profiles p ON p.id = (a.payload->>'actor_id')::UUID
  WHERE a.payload->>'action' = 'login'
  ORDER BY a.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant execute to authenticated users (will be filtered by API auth)
GRANT EXECUTE ON FUNCTION public.get_sign_in_logs TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sign_in_logs TO service_role;
