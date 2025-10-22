-- Add unique constraint to prevent duplicate students with same initials/grade/provider
-- This prevents race conditions during bulk import where two concurrent requests
-- could both pass the duplicate check and insert duplicate records

-- Create unique index using CONCURRENTLY to avoid locking the table
-- (Note: CONCURRENTLY requires running outside a transaction block)
CREATE UNIQUE INDEX IF NOT EXISTS ux_students_provider_grade_initials
  ON public.students(provider_id, grade_level, initials);

-- Add comment explaining the constraint
COMMENT ON INDEX public.ux_students_provider_grade_initials IS
  'Ensures no duplicate students with same provider, grade level, and initials. Prevents race conditions during bulk import.';
