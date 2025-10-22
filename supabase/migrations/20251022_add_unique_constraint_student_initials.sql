-- Add unique constraint to prevent duplicate students with same initials/grade/provider
-- This prevents race conditions during bulk import where two concurrent requests
-- could both pass the duplicate check and insert duplicate records

-- NOTE: Using regular CREATE INDEX (not CONCURRENTLY) to work with transaction-based migrations
-- CONCURRENTLY cannot run inside transaction blocks, which is how Supabase migrations execute
-- For small-medium tables, the lock duration is acceptable during deployment
-- For production with large datasets, see companion script below for zero-downtime approach

CREATE UNIQUE INDEX IF NOT EXISTS ux_students_provider_grade_initials
  ON public.students(provider_id, grade_level, initials);

-- Add comment explaining the constraint
COMMENT ON INDEX public.ux_students_provider_grade_initials IS
  'Ensures no duplicate students with same provider, grade level, and initials. Prevents race conditions during bulk import.';

-- ============================================================================
-- PRODUCTION DEPLOYMENT NOTES (for large tables with zero-downtime requirement)
-- ============================================================================
-- If you need to apply this in production without locking the students table:
--
-- 1. Skip this migration file initially (it will fail with CONCURRENTLY in transaction)
-- 2. Run the following SQL directly via psql/SQL editor (NOT via migration system):
--
--    CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_students_provider_grade_initials
--      ON public.students(provider_id, grade_level, initials);
--
--    COMMENT ON INDEX public.ux_students_provider_grade_initials IS
--      'Ensures no duplicate students with same provider, grade level, and initials. Prevents race conditions during bulk import.';
--
-- 3. Mark this migration as applied in your migration tracking
--
-- The CONCURRENTLY version builds the index without blocking writes, but takes longer.
-- ============================================================================
