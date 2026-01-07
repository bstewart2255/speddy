-- Fix Security Advisor Warnings
-- 1. Add search_path to get_sign_in_logs function
-- 2. Tighten RLS policies on lesson/performance tables

-- ============================================
-- 1. Fix get_sign_in_logs function search_path
-- ============================================
CREATE OR REPLACE FUNCTION public.get_sign_in_logs(p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  email text,
  full_name text,
  role text,
  provider text,
  ip_address text,
  user_agent text,
  session_duration_minutes integer,
  created_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

-- ============================================
-- 2. Fix lesson_adjustment_queue RLS policies
-- ============================================
-- Drop overly permissive policies
DROP POLICY IF EXISTS "Allow authenticated users to insert lesson_adjustment_queue" ON lesson_adjustment_queue;
DROP POLICY IF EXISTS "Allow authenticated users to update lesson_adjustment_queue" ON lesson_adjustment_queue;

-- Create proper policies that check student ownership
CREATE POLICY "Providers can insert adjustments for their students"
ON lesson_adjustment_queue
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_adjustment_queue.student_id
    AND s.provider_id = auth.uid()
  )
);

CREATE POLICY "Providers can update adjustments for their students"
ON lesson_adjustment_queue
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_adjustment_queue.student_id
    AND s.provider_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_adjustment_queue.student_id
    AND s.provider_id = auth.uid()
  )
);

-- ============================================
-- 3. Fix lesson_performance_history RLS policies
-- ============================================
DROP POLICY IF EXISTS "Allow authenticated users to insert lesson_performance_history" ON lesson_performance_history;
DROP POLICY IF EXISTS "Allow authenticated users to update lesson_performance_history" ON lesson_performance_history;

CREATE POLICY "Providers can insert performance for their students"
ON lesson_performance_history
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_performance_history.student_id
    AND s.provider_id = auth.uid()
  )
);

CREATE POLICY "Providers can update performance for their students"
ON lesson_performance_history
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_performance_history.student_id
    AND s.provider_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = lesson_performance_history.student_id
    AND s.provider_id = auth.uid()
  )
);

-- ============================================
-- 4. Fix student_performance_metrics RLS policies
-- ============================================
DROP POLICY IF EXISTS "Allow authenticated users to insert student_performance_metrics" ON student_performance_metrics;
DROP POLICY IF EXISTS "Allow authenticated users to update student_performance_metrics" ON student_performance_metrics;

CREATE POLICY "Providers can insert metrics for their students"
ON student_performance_metrics
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_performance_metrics.student_id
    AND s.provider_id = auth.uid()
  )
);

CREATE POLICY "Providers can update metrics for their students"
ON student_performance_metrics
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_performance_metrics.student_id
    AND s.provider_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = student_performance_metrics.student_id
    AND s.provider_id = auth.uid()
  )
);

-- ============================================
-- 5. Fix upload_rate_limits RLS policy
-- (This is public for rate limiting, but we can add IP validation)
-- ============================================
DROP POLICY IF EXISTS "Allow rate limit inserts" ON upload_rate_limits;

-- Insert only allowed if no recent upload from same IP+worksheet combo
-- This enforces the rate limit at the DB level
CREATE POLICY "Allow rate limit inserts with validation"
ON upload_rate_limits
FOR INSERT
TO public
WITH CHECK (
  -- Only allow if no upload from this IP/worksheet in last minute
  NOT EXISTS (
    SELECT 1 FROM upload_rate_limits r
    WHERE r.ip_address = upload_rate_limits.ip_address
    AND r.worksheet_code = upload_rate_limits.worksheet_code
    AND r.uploaded_at > (now() - interval '1 minute')
  )
);

-- ============================================
-- 6. Fix worksheet_submissions RLS policy
-- (Public insert needed for anonymous submissions, but add worksheet validation)
-- ============================================
DROP POLICY IF EXISTS "Anyone can insert worksheet submissions" ON worksheet_submissions;

-- Only allow insert if the worksheet exists and is valid
CREATE POLICY "Anyone can insert valid worksheet submissions"
ON worksheet_submissions
FOR INSERT
TO public
WITH CHECK (
  -- Worksheet must exist (prevents random data injection)
  EXISTS (
    SELECT 1 FROM worksheets w
    WHERE w.id = worksheet_submissions.worksheet_id
  )
);

-- Add comment documenting the security decision
COMMENT ON POLICY "Anyone can insert valid worksheet submissions" ON worksheet_submissions IS
'Public insert is intentional - students submit completed worksheets without authentication. Validated by worksheet_id existence.';

COMMENT ON POLICY "Allow rate limit inserts with validation" ON upload_rate_limits IS
'Public insert is intentional for rate limiting anonymous uploads. Enforces 1-minute cooldown per IP+worksheet.';
