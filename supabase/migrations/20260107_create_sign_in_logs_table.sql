-- Create permanent sign-in logs table
-- This captures all login events with IP address and user agent for auditing

-- 1. Create the permanent sign-in logs table
CREATE TABLE IF NOT EXISTS public.sign_in_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT,
  provider TEXT DEFAULT 'email',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT sign_in_logs_unique_user_timestamp UNIQUE (user_id, created_at)
);

-- Create index for fast queries
CREATE INDEX IF NOT EXISTS idx_sign_in_logs_created_at ON public.sign_in_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sign_in_logs_user_id ON public.sign_in_logs(user_id);

-- 2. Create trigger function to capture sign-ins from auth.audit_log_entries
CREATE OR REPLACE FUNCTION public.capture_sign_in_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_full_name TEXT;
  v_role TEXT;
  v_provider TEXT;
  v_ip TEXT;
  v_user_agent TEXT;
BEGIN
  -- Only process login events
  IF NEW.payload->>'action' = 'login' THEN
    v_user_id := (NEW.payload->>'actor_id')::UUID;
    v_email := NEW.payload->>'actor_username';
    v_full_name := NEW.payload->>'actor_name';
    v_provider := COALESCE(NEW.payload->'traits'->>'provider', 'email');
    v_ip := NEW.ip_address;

    -- Get role from profiles
    SELECT role INTO v_role FROM public.profiles WHERE id = v_user_id;

    -- Try to get user_agent and better IP from sessions (created around same time)
    SELECT s.user_agent, COALESCE(s.ip::TEXT, v_ip)
    INTO v_user_agent, v_ip
    FROM auth.sessions s
    WHERE s.user_id = v_user_id
      AND s.created_at >= NEW.created_at - INTERVAL '5 seconds'
      AND s.created_at <= NEW.created_at + INTERVAL '5 seconds'
    LIMIT 1;

    -- Insert into our permanent log; errors here should not break authentication
    BEGIN
      INSERT INTO public.sign_in_logs (user_id, email, full_name, role, provider, ip_address, user_agent, created_at)
      VALUES (v_user_id, v_email, v_full_name, v_role, v_provider, v_ip, v_user_agent, NEW.created_at)
      ON CONFLICT (user_id, created_at) DO NOTHING;
    EXCEPTION
      WHEN others THEN
        RAISE LOG 'capture_sign_in_log: failed to insert for user % (email %): %', v_user_id, v_email, SQLERRM;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- 3. Create trigger on auth.audit_log_entries
DROP TRIGGER IF EXISTS on_auth_sign_in ON auth.audit_log_entries;
CREATE TRIGGER on_auth_sign_in
  AFTER INSERT ON auth.audit_log_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_sign_in_log();

-- 4. Backfill existing sign-ins from audit_log_entries (only for users that still exist)
-- Use DISTINCT ON to avoid row multiplication from session join
INSERT INTO public.sign_in_logs (user_id, email, full_name, role, provider, ip_address, user_agent, created_at)
SELECT DISTINCT ON (a.id)
  (a.payload->>'actor_id')::UUID as user_id,
  a.payload->>'actor_username' as email,
  COALESCE(a.payload->>'actor_name', p.full_name) as full_name,
  p.role,
  COALESCE(a.payload->'traits'->>'provider', 'email') as provider,
  COALESCE(s.ip::TEXT, a.ip_address::TEXT) as ip_address,
  s.user_agent,
  a.created_at
FROM auth.audit_log_entries a
INNER JOIN auth.users u ON u.id = (a.payload->>'actor_id')::UUID
LEFT JOIN public.profiles p ON p.id = (a.payload->>'actor_id')::UUID
LEFT JOIN auth.sessions s ON s.user_id = (a.payload->>'actor_id')::UUID
  AND s.created_at >= a.created_at - INTERVAL '5 seconds'
  AND s.created_at <= a.created_at + INTERVAL '5 seconds'
WHERE a.payload->>'action' = 'login'
ORDER BY a.id, s.created_at DESC NULLS LAST
ON CONFLICT (user_id, created_at) DO NOTHING;

-- 5. Update get_sign_in_logs to use our new table
DROP FUNCTION IF EXISTS public.get_sign_in_logs(integer, integer);

CREATE OR REPLACE FUNCTION public.get_sign_in_logs(p_limit INT DEFAULT 50, p_offset INT DEFAULT 0)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  provider TEXT,
  ip_address TEXT,
  user_agent TEXT,
  session_duration_minutes INT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.user_id,
    s.email,
    s.full_name,
    COALESCE(s.role, p.role) as role,
    s.provider,
    s.ip_address,
    s.user_agent,
    NULL::INT as session_duration_minutes,
    s.created_at
  FROM public.sign_in_logs s
  LEFT JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- 6. Enable RLS on sign_in_logs (service_role only; API route enforces speddy admin check)
ALTER TABLE public.sign_in_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can access sign_in_logs"
  ON public.sign_in_logs
  FOR ALL
  TO service_role
  USING (true);

-- Grant permissions (only service_role can execute RPC to prevent unauthorized access)
-- The API route enforces Speddy admin check before calling RPC
GRANT SELECT ON public.sign_in_logs TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sign_in_logs TO service_role;
