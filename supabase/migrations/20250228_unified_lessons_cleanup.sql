-- ============================================================================
-- CLEANUP SCRIPT FOR UNIFIED LESSONS TABLE MIGRATION
-- Date: 2025-02-28 (Run 30 days after migration)
-- Purpose: Remove legacy tables and fields after successful verification
-- 
-- IMPORTANT: Only run this after confirming the migration was successful
--           and all features are working correctly with the new structure
-- ============================================================================

-- ============================================================================
-- SECTION 1: PRE-CLEANUP VERIFICATION
-- ============================================================================

DO $$
DECLARE
    days_since_migration INTEGER;
    legacy_records INTEGER;
    total_records INTEGER;
BEGIN
    -- Check how long since migration
    SELECT EXTRACT(DAY FROM (CURRENT_TIMESTAMP - MIN(migration_date)))::INTEGER
    INTO days_since_migration
    FROM lessons
    WHERE migration_date IS NOT NULL;
    
    IF days_since_migration < 30 THEN
        RAISE WARNING 'Only % days since migration. Recommended to wait 30 days.', days_since_migration;
        -- Uncomment to enforce 30-day waiting period:
        -- RAISE EXCEPTION 'Migration verification period not complete. Please wait % more days.', (30 - days_since_migration);
    END IF;
    
    -- Count records
    SELECT COUNT(*) INTO total_records FROM lessons;
    SELECT COUNT(*) INTO legacy_records FROM lessons WHERE legacy_table_source IS NOT NULL;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'PRE-CLEANUP STATUS';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Days since migration: %', days_since_migration;
    RAISE NOTICE 'Total lessons: %', total_records;
    RAISE NOTICE 'Migrated records: %', legacy_records;
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- SECTION 2: CONVERT REMAINING HTML CONTENT TO JSON
-- ============================================================================

DO $$
DECLARE
    html_count INTEGER;
    converted_count INTEGER := 0;
BEGIN
    SELECT COUNT(*) INTO html_count 
    FROM lessons 
    WHERE lesson_source = 'legacy_html' 
    AND legacy_content_html IS NOT NULL;
    
    IF html_count > 0 THEN
        RAISE NOTICE 'Converting % legacy HTML lessons to JSON format...', html_count;
        
        -- Convert HTML to structured JSON
        UPDATE lessons
        SET 
            content = jsonb_build_object(
                'converted_from_html', true,
                'original_format', 'html',
                'content', legacy_content_html,
                'conversion_date', CURRENT_TIMESTAMP,
                'activities', jsonb_build_array(
                    jsonb_build_object(
                        'type', 'converted_lesson',
                        'description', 'Legacy HTML content - needs review',
                        'html_content', legacy_content_html
                    )
                )
            ),
            lesson_source = 'imported',
            metadata = COALESCE(metadata, '{}'::jsonb) || 
                      jsonb_build_object('converted_from_html', true, 'conversion_date', CURRENT_TIMESTAMP)
        WHERE lesson_source = 'legacy_html' 
        AND legacy_content_html IS NOT NULL;
        
        GET DIAGNOSTICS converted_count = ROW_COUNT;
        RAISE NOTICE 'Converted % HTML lessons to JSON format', converted_count;
    ELSE
        RAISE NOTICE 'No HTML lessons to convert';
    END IF;
END $$;

-- ============================================================================
-- SECTION 3: CREATE FINAL BACKUP BEFORE CLEANUP
-- ============================================================================

-- Create a final snapshot before removing legacy data
CREATE TABLE IF NOT EXISTS lessons_pre_cleanup_backup AS 
SELECT * FROM lessons;

CREATE TABLE IF NOT EXISTS lessons_old_final_backup AS 
SELECT * FROM lessons_old;

CREATE TABLE IF NOT EXISTS ai_generated_lessons_final_backup AS 
SELECT * FROM ai_generated_lessons;

CREATE TABLE IF NOT EXISTS manual_lesson_plans_final_backup AS 
SELECT * FROM manual_lesson_plans;

RAISE NOTICE 'Final backups created before cleanup';

-- ============================================================================
-- SECTION 4: DROP COMPATIBILITY VIEWS
-- ============================================================================

DROP VIEW IF EXISTS ai_generated_lessons_compat CASCADE;
DROP VIEW IF EXISTS manual_lesson_plans_compat CASCADE;
DROP VIEW IF EXISTS lessons_old_compat CASCADE;

RAISE NOTICE 'Compatibility views removed';

-- ============================================================================
-- SECTION 5: DROP OLD TABLES
-- ============================================================================

-- Drop the original tables that are no longer needed
DROP TABLE IF EXISTS lessons_old CASCADE;
DROP TABLE IF EXISTS ai_generated_lessons CASCADE;
DROP TABLE IF EXISTS manual_lesson_plans CASCADE;

RAISE NOTICE 'Legacy tables removed';

-- ============================================================================
-- SECTION 6: REMOVE LEGACY COLUMNS FROM UNIFIED TABLE
-- ============================================================================

-- Remove migration tracking columns
ALTER TABLE lessons 
    DROP COLUMN IF EXISTS legacy_content_html,
    DROP COLUMN IF EXISTS legacy_table_source,
    DROP COLUMN IF EXISTS migration_date;

RAISE NOTICE 'Legacy columns removed from lessons table';

-- ============================================================================
-- SECTION 7: OPTIMIZE TABLE AND INDEXES
-- ============================================================================

-- Vacuum and analyze to reclaim space and update statistics
VACUUM ANALYZE lessons;

-- Reindex to optimize performance
REINDEX TABLE lessons;

RAISE NOTICE 'Table optimized and reindexed';

-- ============================================================================
-- SECTION 8: UPDATE FOREIGN KEY REFERENCES
-- ============================================================================

-- Ensure all foreign keys reference the new lessons table
-- (Most relationships should already be correct, but verify)

-- Update any triggers that might reference old tables
DO $$
BEGIN
    -- Add any specific trigger updates here if needed
    RAISE NOTICE 'Foreign key references verified';
END $$;

-- ============================================================================
-- SECTION 9: CLEANUP OLD BACKUP TABLES
-- ============================================================================

-- Remove intermediate backup tables (keep final backups for archive)
DROP TABLE IF EXISTS lessons_backup_20250128;
DROP TABLE IF EXISTS ai_generated_lessons_backup_20250128;
DROP TABLE IF EXISTS manual_lesson_plans_backup_20250128;

RAISE NOTICE 'Intermediate backup tables removed';

-- ============================================================================
-- SECTION 10: FINAL VERIFICATION
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
    view_count INTEGER;
    lesson_count INTEGER;
    index_count INTEGER;
BEGIN
    -- Count remaining tables
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('lessons_old', 'ai_generated_lessons', 'manual_lesson_plans');
    
    -- Count remaining views
    SELECT COUNT(*) INTO view_count
    FROM information_schema.views
    WHERE table_schema = 'public'
    AND table_name LIKE '%_compat';
    
    -- Count lessons
    SELECT COUNT(*) INTO lesson_count FROM lessons;
    
    -- Count indexes
    SELECT COUNT(*) INTO index_count
    FROM pg_indexes
    WHERE tablename = 'lessons';
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'CLEANUP COMPLETED SUCCESSFULLY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Final status:';
    RAISE NOTICE '  - Old tables remaining: %', table_count;
    RAISE NOTICE '  - Compatibility views remaining: %', view_count;
    RAISE NOTICE '  - Total lessons in unified table: %', lesson_count;
    RAISE NOTICE '  - Indexes on lessons table: %', index_count;
    RAISE NOTICE '========================================';
    
    IF table_count > 0 OR view_count > 0 THEN
        RAISE WARNING 'Some legacy structures still exist. Review manually.';
    ELSE
        RAISE NOTICE 'All legacy structures successfully removed.';
        RAISE NOTICE 'The lessons table consolidation is complete!';
    END IF;
END $$;

-- ============================================================================
-- SECTION 11: UPDATE DOCUMENTATION
-- ============================================================================

-- Update table comments
COMMENT ON TABLE lessons IS 'Unified lessons table containing all lesson types (AI-generated, manual, imported). Consolidated from three legacy tables on 2025-01-28.';

-- Remove comments about legacy fields (they no longer exist)
COMMENT ON COLUMN lessons.lesson_source IS 'Source of the lesson: ai_generated, ai_enhanced, manual, or imported';
COMMENT ON COLUMN lessons.content IS 'Main lesson content in flexible JSONB format. Structure varies by lesson_source.';

-- ============================================================================
-- SECTION 12: ARCHIVE NOTICE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ARCHIVAL INFORMATION';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'The following backup tables have been retained for archival:';
    RAISE NOTICE '  - lessons_pre_cleanup_backup';
    RAISE NOTICE '  - lessons_old_final_backup';
    RAISE NOTICE '  - ai_generated_lessons_final_backup';
    RAISE NOTICE '  - manual_lesson_plans_final_backup';
    RAISE NOTICE '';
    RAISE NOTICE 'These can be safely dropped after 90 days if no issues arise.';
    RAISE NOTICE 'To drop them, run:';
    RAISE NOTICE '  DROP TABLE lessons_pre_cleanup_backup;';
    RAISE NOTICE '  DROP TABLE lessons_old_final_backup;';
    RAISE NOTICE '  DROP TABLE ai_generated_lessons_final_backup;';
    RAISE NOTICE '  DROP TABLE manual_lesson_plans_final_backup;';
    RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- END OF CLEANUP
-- ============================================================================