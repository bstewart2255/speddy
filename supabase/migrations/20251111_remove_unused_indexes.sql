-- Remove unused indexes to reduce storage overhead and improve write performance
-- Performance Issue: Unused indexes consume storage and slow down INSERT/UPDATE/DELETE operations
-- Documentation: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index
--
-- This migration drops 5 indexes that have never been used according to pg_stat_user_indexes.
-- Removing unused indexes reduces:
-- 1. Storage overhead
-- 2. Write operation costs (INSERT/UPDATE/DELETE are faster without maintaining unused indexes)
-- 3. VACUUM and ANALYZE overhead
--
-- Note: If any of these indexes become needed in the future, they can be recreated.

-- ========================================
-- Drop unused indexes
-- ========================================

-- 1. idx_saved_worksheets_created_at
-- This index has not been used for queries
-- created_at is rarely used as a filter for saved_worksheets
DROP INDEX IF EXISTS public.idx_saved_worksheets_created_at;

-- 2. idx_exit_ticket_results_student
-- This index has not been used
-- Note: We're adding idx_exit_ticket_results_student_id in the foreign key migration instead
DROP INDEX IF EXISTS public.idx_exit_ticket_results_student;

-- 3. idx_exit_ticket_results_graded_at
-- This index has not been used for queries
-- graded_at is rarely filtered in queries
DROP INDEX IF EXISTS public.idx_exit_ticket_results_graded_at;

-- 4. idx_lessons_generation_version
-- This index has not been used
-- generation_version is not commonly filtered in queries
DROP INDEX IF EXISTS public.idx_lessons_generation_version;

-- 5. idx_documents_created_by
-- This index has not been used
-- Note: created_by filtering is already covered by RLS policies and other indexes
DROP INDEX IF EXISTS public.idx_documents_created_by;


-- ========================================
-- Verification & Statistics
-- ========================================

DO $$
DECLARE
  dropped_count INTEGER;
  unused_count INTEGER;
BEGIN
  -- Count remaining unused indexes
  SELECT COUNT(*) INTO unused_count
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND idx_scan = 0
    AND indexrelname LIKE 'idx_%';

  RAISE NOTICE 'Unused index cleanup completed.';
  RAISE NOTICE 'Dropped 5 unused indexes to improve write performance.';

  IF unused_count > 0 THEN
    RAISE NOTICE 'Remaining unused indexes in public schema: %', unused_count;
    RAISE NOTICE 'These may be new indexes or indexes that have not been queried yet.';
  ELSE
    RAISE NOTICE 'No remaining unused indexes detected.';
  END IF;
END $$;

-- Note: VACUUM cannot be run inside a transaction
-- Run these commands manually after the migration completes:
--
-- VACUUM ANALYZE public.saved_worksheets;
-- VACUUM ANALYZE public.exit_ticket_results;
-- VACUUM ANALYZE public.lessons;
-- VACUUM ANALYZE public.documents;
