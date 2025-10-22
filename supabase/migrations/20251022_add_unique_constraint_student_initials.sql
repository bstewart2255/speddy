-- Add unique constraint to prevent duplicate students with same initials/grade/provider
-- This prevents race conditions during bulk import where two concurrent requests
-- could both pass the duplicate check and insert duplicate records

-- IMPORTANT: This migration must be run OUTSIDE a transaction block
-- The CONCURRENTLY keyword requires non-transactional execution
-- If using Supabase CLI: Run this migration manually with --no-transaction flag
-- Example: supabase migration apply --no-transaction 20251022_add_unique_constraint_student_initials

-- Create unique index using CONCURRENTLY to avoid locking the table
-- CONCURRENTLY allows the index to be built without preventing concurrent writes
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS ux_students_provider_grade_initials
  ON public.students(provider_id, grade_level, initials);

-- Add comment explaining the constraint
COMMENT ON INDEX public.ux_students_provider_grade_initials IS
  'Ensures no duplicate students with same provider, grade level, and initials. Prevents race conditions during bulk import.';
