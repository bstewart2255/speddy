-- ============================================================================
-- DROP SAVED_WORKSHEETS TABLE
-- Date: 2025-09-06
-- Purpose: Remove redundant saved_worksheets table, now using unified lessons
-- ============================================================================

DROP TABLE IF EXISTS saved_worksheets CASCADE;

-- The Lessons page will now save to the unified lessons table with:
-- - lesson_source = 'ai_generated'
-- - JSON content storage
-- - Student association via student_ids array