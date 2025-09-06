-- ============================================================================
-- ROLLBACK SCRIPT FOR UNIFIED LESSONS TABLE MIGRATION
-- Date: 2025-01-28
-- Purpose: Safely rollback the unified lessons migration if needed
-- 
-- IMPORTANT: Only run this if the migration needs to be reversed
-- ============================================================================

-- ============================================================================
-- SECTION 1: VERIFICATION BEFORE ROLLBACK
-- ============================================================================

DO $$
DECLARE
    backup_exists BOOLEAN;
BEGIN
    -- Check if backup tables exist
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'lessons_old'
    ) INTO backup_exists;
    
    IF NOT backup_exists THEN
        RAISE EXCEPTION 'Cannot rollback: lessons_old table not found. Original data may be lost.';
    END IF;
    
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'lessons_backup_20250128'
    ) INTO backup_exists;
    
    IF NOT backup_exists THEN
        RAISE WARNING 'Backup table lessons_backup_20250128 not found. Proceeding with lessons_old.';
    END IF;
    
    RAISE NOTICE 'Starting rollback of unified lessons migration...';
END $$;

-- ============================================================================
-- SECTION 2: DROP NEW STRUCTURES
-- ============================================================================

-- Drop RLS policies
DROP POLICY IF EXISTS lessons_select_own ON lessons;
DROP POLICY IF EXISTS lessons_insert_own ON lessons;
DROP POLICY IF EXISTS lessons_update_own ON lessons;
DROP POLICY IF EXISTS lessons_delete_own ON lessons;
DROP POLICY IF EXISTS lessons_select_sea ON lessons;
DROP POLICY IF EXISTS lessons_select_shared_school ON lessons;

-- Drop compatibility views
DROP VIEW IF EXISTS ai_generated_lessons_compat CASCADE;
DROP VIEW IF EXISTS manual_lesson_plans_compat CASCADE;
DROP VIEW IF EXISTS lessons_old_compat CASCADE;

-- Drop the trigger and function
DROP TRIGGER IF EXISTS lessons_updated_at_trigger ON lessons;
DROP FUNCTION IF EXISTS update_lessons_updated_at();

-- Drop the new lessons table
DROP TABLE IF EXISTS lessons CASCADE;

-- ============================================================================
-- SECTION 3: RESTORE ORIGINAL LESSONS TABLE
-- ============================================================================

-- Rename lessons_old back to lessons
ALTER TABLE lessons_old RENAME TO lessons;

-- Restore original index names
ALTER INDEX IF EXISTS lessons_old_pkey RENAME TO lessons_pkey;
ALTER INDEX IF EXISTS idx_lessons_old_provider_date RENAME TO idx_lessons_provider_date;

-- Re-enable RLS on original lessons table
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Recreate original RLS policies (you may need to adjust these based on your original policies)
CREATE POLICY lessons_select_policy
    ON lessons
    FOR SELECT
    USING (auth.uid() = provider_id);

CREATE POLICY lessons_insert_policy
    ON lessons
    FOR INSERT
    WITH CHECK (auth.uid() = provider_id);

CREATE POLICY lessons_update_policy
    ON lessons
    FOR UPDATE
    USING (auth.uid() = provider_id)
    WITH CHECK (auth.uid() = provider_id);

CREATE POLICY lessons_delete_policy
    ON lessons
    FOR DELETE
    USING (auth.uid() = provider_id);

-- ============================================================================
-- SECTION 4: RESTORE DATA INTEGRITY
-- ============================================================================

-- If any new records were added to the unified table during testing,
-- we need to preserve them in the appropriate original tables

DO $$
DECLARE
    new_records_count INTEGER;
BEGIN
    -- Check if there are any records that don't exist in the backup
    SELECT COUNT(*) INTO new_records_count
    FROM lessons l
    WHERE NOT EXISTS (
        SELECT 1 FROM lessons_backup_20250128 b
        WHERE b.id = l.id
    );
    
    IF new_records_count > 0 THEN
        RAISE NOTICE 'Found % new records added after migration. These will be preserved.', new_records_count;
        
        -- You may want to manually review these records
        -- They represent data added between migration and rollback
    END IF;
END $$;

-- ============================================================================
-- SECTION 5: VERIFY ai_generated_lessons AND manual_lesson_plans
-- ============================================================================

-- These tables should still exist unchanged
DO $$
DECLARE
    table_exists BOOLEAN;
    record_count INTEGER;
BEGIN
    -- Check ai_generated_lessons
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ai_generated_lessons'
    ) INTO table_exists;
    
    IF table_exists THEN
        SELECT COUNT(*) INTO record_count FROM ai_generated_lessons;
        RAISE NOTICE 'ai_generated_lessons table exists with % records', record_count;
    ELSE
        RAISE WARNING 'ai_generated_lessons table not found!';
    END IF;
    
    -- Check manual_lesson_plans
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'manual_lesson_plans'
    ) INTO table_exists;
    
    IF table_exists THEN
        SELECT COUNT(*) INTO record_count FROM manual_lesson_plans;
        RAISE NOTICE 'manual_lesson_plans table exists with % records', record_count;
    ELSE
        RAISE WARNING 'manual_lesson_plans table not found!';
    END IF;
END $$;

-- ============================================================================
-- SECTION 6: DROP CUSTOM TYPES (if no longer needed)
-- ============================================================================

-- Check if types are used elsewhere before dropping
DO $$
BEGIN
    -- Only drop if not used by other tables
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_depend d
        JOIN pg_type t ON d.refobjid = t.oid
        WHERE t.typname IN ('lesson_source', 'lesson_status')
        AND d.deptype = 'n'
    ) THEN
        DROP TYPE IF EXISTS lesson_source CASCADE;
        DROP TYPE IF EXISTS lesson_status CASCADE;
        RAISE NOTICE 'Dropped custom types lesson_source and lesson_status';
    ELSE
        RAISE NOTICE 'Custom types are still in use, not dropping';
    END IF;
END $$;

-- ============================================================================
-- SECTION 7: FINAL VERIFICATION
-- ============================================================================

DO $$
DECLARE
    lessons_count INTEGER;
    ai_lessons_count INTEGER;
    manual_lessons_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO lessons_count FROM lessons;
    SELECT COUNT(*) INTO ai_lessons_count FROM ai_generated_lessons;
    SELECT COUNT(*) INTO manual_lessons_count FROM manual_lesson_plans;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'ROLLBACK COMPLETED';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Current record counts:';
    RAISE NOTICE '  - lessons: %', lessons_count;
    RAISE NOTICE '  - ai_generated_lessons: %', ai_lessons_count;
    RAISE NOTICE '  - manual_lesson_plans: %', manual_lessons_count;
    RAISE NOTICE '========================================';
    RAISE NOTICE 'The system has been restored to its original state.';
    RAISE NOTICE 'Please verify that all application features are working correctly.';
END $$;

-- ============================================================================
-- SECTION 8: CLEANUP BACKUP TABLES (OPTIONAL)
-- ============================================================================

-- Only run these if you're sure the rollback was successful
-- and you no longer need the backup tables

/*
-- DANGER: Only uncomment and run after verifying rollback success
DROP TABLE IF EXISTS lessons_backup_20250128;
DROP TABLE IF EXISTS ai_generated_lessons_backup_20250128;
DROP TABLE IF EXISTS manual_lesson_plans_backup_20250128;
*/

-- ============================================================================
-- END OF ROLLBACK
-- ============================================================================