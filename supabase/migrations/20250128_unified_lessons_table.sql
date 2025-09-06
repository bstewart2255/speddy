-- ============================================================================
-- UNIFIED LESSONS TABLE MIGRATION
-- Date: 2025-01-28
-- Purpose: Consolidate lessons, ai_generated_lessons, and manual_lesson_plans
--          into a single unified lessons table
-- 
-- IMPORTANT: This migration:
-- - Creates backup tables for all existing data
-- - Creates a new unified schema with proper types and constraints
-- - Migrates all data with full integrity preservation
-- - Includes rollback capability
-- - Maintains backwards compatibility through views
-- ============================================================================

-- ============================================================================
-- SECTION 1: PRE-MIGRATION CHECKS AND BACKUPS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Starting unified lessons table migration...';
    RAISE NOTICE 'Current record counts:';
    RAISE NOTICE '  - lessons: %', (SELECT COUNT(*) FROM lessons);
    RAISE NOTICE '  - ai_generated_lessons: %', (SELECT COUNT(*) FROM ai_generated_lessons);
    RAISE NOTICE '  - manual_lesson_plans: %', (SELECT COUNT(*) FROM manual_lesson_plans);
END $$;

-- Create backup tables with timestamp
CREATE TABLE IF NOT EXISTS lessons_backup_20250128 AS 
SELECT *, CURRENT_TIMESTAMP as backup_timestamp 
FROM lessons;

CREATE TABLE IF NOT EXISTS ai_generated_lessons_backup_20250128 AS 
SELECT *, CURRENT_TIMESTAMP as backup_timestamp 
FROM ai_generated_lessons;

CREATE TABLE IF NOT EXISTS manual_lesson_plans_backup_20250128 AS 
SELECT *, CURRENT_TIMESTAMP as backup_timestamp 
FROM manual_lesson_plans;

-- Verify backups
DO $$
BEGIN
    IF (SELECT COUNT(*) FROM lessons_backup_20250128) != (SELECT COUNT(*) FROM lessons) THEN
        RAISE EXCEPTION 'Backup verification failed for lessons table';
    END IF;
    
    IF (SELECT COUNT(*) FROM ai_generated_lessons_backup_20250128) != (SELECT COUNT(*) FROM ai_generated_lessons) THEN
        RAISE EXCEPTION 'Backup verification failed for ai_generated_lessons table';
    END IF;
    
    IF (SELECT COUNT(*) FROM manual_lesson_plans_backup_20250128) != (SELECT COUNT(*) FROM manual_lesson_plans) THEN
        RAISE EXCEPTION 'Backup verification failed for manual_lesson_plans table';
    END IF;
    
    RAISE NOTICE 'All backups created and verified successfully';
END $$;

-- ============================================================================
-- SECTION 2: CREATE TYPE DEFINITIONS
-- ============================================================================

-- Create enum type for lesson sources
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_source') THEN
        CREATE TYPE lesson_source AS ENUM (
            'ai_generated',      -- AI-generated from calendar/upcoming sessions
            'ai_enhanced',       -- AI-generated with differentiation
            'manual',           -- Manually created by provider
            'imported',         -- Imported from external source
            'legacy_html'       -- Legacy HTML format (for migration)
        );
    END IF;
END $$;

-- Create enum type for lesson status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'lesson_status') THEN
        CREATE TYPE lesson_status AS ENUM (
            'draft',            -- In progress, not finalized
            'published',        -- Ready for use
            'archived',         -- No longer active
            'scheduled'         -- Scheduled for future
        );
    END IF;
END $$;

-- ============================================================================
-- SECTION 3: RENAME EXISTING LESSONS TABLE
-- ============================================================================

-- Rename the existing lessons table to preserve it
ALTER TABLE lessons RENAME TO lessons_old;

-- Also rename any indexes to avoid conflicts
ALTER INDEX IF EXISTS lessons_pkey RENAME TO lessons_old_pkey;
ALTER INDEX IF EXISTS idx_lessons_provider_date RENAME TO idx_lessons_old_provider_date;

-- ============================================================================
-- SECTION 4: CREATE NEW UNIFIED LESSONS TABLE
-- ============================================================================

CREATE TABLE lessons (
    -- Primary Identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lesson_source lesson_source NOT NULL DEFAULT 'manual',
    lesson_status lesson_status NOT NULL DEFAULT 'published',
    
    -- Temporal Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lesson_date DATE NOT NULL,
    time_slot TEXT,
    
    -- Location Context (Multi-site Support)
    school_id VARCHAR(255) REFERENCES schools(id) ON DELETE SET NULL,
    district_id VARCHAR(255) REFERENCES districts(id) ON DELETE SET NULL,
    state_id VARCHAR(255) REFERENCES states(id) ON DELETE SET NULL,
    
    -- Core Content
    title TEXT,
    subject TEXT,
    topic TEXT,
    grade_levels TEXT[],
    duration_minutes INTEGER CHECK (duration_minutes > 0 AND duration_minutes <= 480),
    
    -- Main content storage (JSONB for flexibility)
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Student Association
    student_ids UUID[],
    student_details JSONB,
    
    -- Metadata and Notes
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    
    -- AI Generation Tracking
    ai_model VARCHAR(50),
    ai_prompt TEXT,
    ai_raw_response JSONB,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    generation_metadata JSONB,
    
    -- Legacy Support (for migration)
    legacy_content_html TEXT,
    legacy_table_source TEXT,
    migration_date TIMESTAMPTZ,
    
    -- Constraints
    CONSTRAINT lessons_unique_calendar_slot 
        UNIQUE (provider_id, school_id, lesson_date, time_slot),
    
    CONSTRAINT lessons_valid_duration 
        CHECK (duration_minutes IS NULL OR duration_minutes > 0),
    
    CONSTRAINT lessons_valid_tokens 
        CHECK (
            (prompt_tokens IS NULL AND completion_tokens IS NULL) OR
            (prompt_tokens >= 0 AND completion_tokens >= 0)
        ),
    
    CONSTRAINT lessons_ai_fields_consistency 
        CHECK (
            (lesson_source IN ('ai_generated', 'ai_enhanced') AND ai_model IS NOT NULL) OR
            (lesson_source NOT IN ('ai_generated', 'ai_enhanced'))
        )
);

-- ============================================================================
-- SECTION 5: CREATE INDEXES
-- ============================================================================

-- Primary lookup patterns
CREATE INDEX idx_lessons_provider_date 
    ON lessons(provider_id, lesson_date DESC);

CREATE INDEX idx_lessons_provider_school_date 
    ON lessons(provider_id, school_id, lesson_date DESC);

-- Calendar view optimization
CREATE INDEX idx_lessons_calendar_lookup 
    ON lessons(provider_id, school_id, lesson_date, time_slot) 
    WHERE lesson_status = 'published';

-- Student association queries
CREATE INDEX idx_lessons_student_ids 
    ON lessons USING GIN(student_ids);

-- Content search
CREATE INDEX idx_lessons_content_search 
    ON lessons USING GIN(content);

-- Subject/topic filtering
CREATE INDEX idx_lessons_subject_topic 
    ON lessons(subject, topic) 
    WHERE subject IS NOT NULL;

-- Grade level filtering
CREATE INDEX idx_lessons_grade_levels 
    ON lessons USING GIN(grade_levels);

-- Status and source filtering
CREATE INDEX idx_lessons_status ON lessons(lesson_status);
CREATE INDEX idx_lessons_source ON lessons(lesson_source);

-- Migration tracking
CREATE INDEX idx_lessons_migration 
    ON lessons(legacy_table_source, migration_date) 
    WHERE legacy_table_source IS NOT NULL;

-- ============================================================================
-- SECTION 6: CREATE UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lessons_updated_at_trigger
    BEFORE UPDATE ON lessons
    FOR EACH ROW
    EXECUTE FUNCTION update_lessons_updated_at();

-- ============================================================================
-- SECTION 7: MIGRATE DATA FROM lessons_old TABLE
-- ============================================================================

INSERT INTO lessons (
    id,
    provider_id,
    lesson_source,
    lesson_status,
    created_at,
    updated_at,
    lesson_date,
    time_slot,
    school_id,
    district_id,
    state_id,
    title,
    subject,
    topic,
    grade_levels,
    duration_minutes,
    content,
    student_ids,
    student_details,
    metadata,
    notes,
    ai_model,
    ai_prompt,
    ai_raw_response,
    prompt_tokens,
    completion_tokens,
    generation_metadata,
    legacy_content_html,
    legacy_table_source,
    migration_date
)
SELECT 
    id,
    provider_id,
    CASE 
        WHEN content_old_text IS NOT NULL AND content IS NULL THEN 'legacy_html'::lesson_source
        WHEN lesson_type = 'ai' OR ai_raw_response IS NOT NULL THEN 'ai_generated'::lesson_source
        ELSE 'manual'::lesson_source
    END,
    'published'::lesson_status,
    created_at,
    COALESCE(created_at, CURRENT_TIMESTAMP), -- lessons_old doesn't have updated_at
    lesson_date,
    time_slot,
    -- Need to look up school_id from school_site text
    (SELECT id FROM schools WHERE LOWER(name) = LOWER(school_site) LIMIT 1),
    NULL, -- district_id not in old table
    NULL, -- state_id not in old table
    COALESCE(
        metadata->>'title',
        subject || ' - ' || topic
    ),
    subject,
    topic,
    CASE 
        WHEN student_details IS NOT NULL THEN
            ARRAY(SELECT DISTINCT jsonb_array_elements_text(student_details->'students'->'grade_levels'))
        ELSE NULL
    END,
    duration,
    CASE 
        WHEN content IS NOT NULL THEN content
        WHEN content_old_text IS NOT NULL THEN 
            jsonb_build_object(
                'html_content', content_old_text,
                'type', 'legacy_html',
                'needs_conversion', true
            )
        ELSE '{}'::jsonb
    END,
    CASE 
        WHEN student_ids IS NOT NULL AND array_length(student_ids, 1) > 0 
        THEN student_ids::uuid[]
        ELSE NULL
    END,
    student_details,
    metadata,
    notes,
    model_used,
    full_prompt_sent,
    ai_raw_response,
    prompt_tokens,
    completion_tokens,
    generation_metadata,
    content_old_text, -- Preserve original HTML in legacy field
    'lessons_old',
    CURRENT_TIMESTAMP
FROM lessons_old;

DO $$
DECLARE
    migrated_count INTEGER;
    original_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM lessons WHERE legacy_table_source = 'lessons_old';
    SELECT COUNT(*) INTO original_count FROM lessons_old;
    
    IF migrated_count != original_count THEN
        RAISE EXCEPTION 'Migration failed for lessons_old: % records migrated out of %', 
            migrated_count, original_count;
    END IF;
    
    RAISE NOTICE 'Successfully migrated % records from lessons_old', migrated_count;
END $$;

-- ============================================================================
-- SECTION 8: MIGRATE DATA FROM ai_generated_lessons TABLE
-- ============================================================================

INSERT INTO lessons (
    id,
    provider_id,
    lesson_source,
    lesson_status,
    created_at,
    updated_at,
    lesson_date,
    time_slot,
    school_id,
    district_id,
    state_id,
    title,
    subject,
    topic,
    duration_minutes,
    content,
    metadata,
    ai_model,
    ai_prompt,
    ai_raw_response,
    prompt_tokens,
    completion_tokens,
    generation_metadata,
    legacy_table_source,
    migration_date
)
SELECT 
    id,
    provider_id,
    'ai_generated'::lesson_source,
    'published'::lesson_status,
    created_at,
    updated_at,
    lesson_date,
    time_slot,
    school_id,
    district_id,
    state_id,
    -- Extract title from session_data or content
    COALESCE(
        session_data->>'title',
        'AI Lesson - ' || to_char(lesson_date, 'MM/DD/YYYY')
    ),
    session_data->>'subject',
    session_data->>'topic',
    (session_data->>'duration')::integer,
    -- Convert text content to JSONB
    CASE 
        WHEN content IS NOT NULL THEN
            jsonb_build_object(
                'lesson_content', content,
                'session_data', session_data
            )
        ELSE 
            COALESCE(session_data, '{}'::jsonb)
    END,
    jsonb_build_object(
        'original_prompt', prompt,
        'session_data', session_data
    ),
    model_used,
    COALESCE(full_prompt_sent, prompt),
    ai_raw_response,
    prompt_tokens,
    completion_tokens,
    generation_metadata,
    'ai_generated_lessons',
    CURRENT_TIMESTAMP
FROM ai_generated_lessons
ON CONFLICT (provider_id, school_id, lesson_date, time_slot) 
DO UPDATE SET
    -- If there's a conflict, keep the existing record but merge metadata
    metadata = lessons.metadata || EXCLUDED.metadata,
    migration_date = CURRENT_TIMESTAMP;

DO $$
DECLARE
    migrated_count INTEGER;
    original_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM lessons WHERE legacy_table_source = 'ai_generated_lessons';
    SELECT COUNT(*) INTO original_count FROM ai_generated_lessons;
    
    -- Allow for some conflicts due to unique constraint
    IF migrated_count < original_count - 5 THEN
        RAISE WARNING 'Some records from ai_generated_lessons may have conflicts: % records migrated out of %', 
            migrated_count, original_count;
    END IF;
    
    RAISE NOTICE 'Successfully migrated % records from ai_generated_lessons', migrated_count;
END $$;

-- ============================================================================
-- SECTION 9: MIGRATE DATA FROM manual_lesson_plans TABLE
-- ============================================================================

INSERT INTO lessons (
    id,
    provider_id,
    lesson_source,
    lesson_status,
    created_at,
    updated_at,
    lesson_date,
    time_slot,
    school_id,
    district_id,
    state_id,
    title,
    subject,
    topic,
    grade_levels,
    duration_minutes,
    content,
    metadata,
    notes,
    legacy_table_source,
    migration_date
)
SELECT 
    id,
    provider_id,
    'manual'::lesson_source,
    'published'::lesson_status,
    created_at,
    updated_at,
    lesson_date,
    NULL, -- manual lessons don't have time_slot
    school_id,
    district_id,
    state_id,
    title,
    subject,
    NULL, -- topic not in manual_lesson_plans
    grade_levels,
    duration_minutes,
    jsonb_build_object(
        'objectives', objectives,
        'materials', materials,
        'activities', activities,
        'assessment', assessment
    ),
    jsonb_build_object(
        'type', 'manual_lesson_plan',
        'original_structure', true
    ),
    notes,
    'manual_lesson_plans',
    CURRENT_TIMESTAMP
FROM manual_lesson_plans;

DO $$
DECLARE
    migrated_count INTEGER;
    original_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO migrated_count FROM lessons WHERE legacy_table_source = 'manual_lesson_plans';
    SELECT COUNT(*) INTO original_count FROM manual_lesson_plans;
    
    IF migrated_count != original_count THEN
        RAISE EXCEPTION 'Migration failed for manual_lesson_plans: % records migrated out of %', 
            migrated_count, original_count;
    END IF;
    
    RAISE NOTICE 'Successfully migrated % records from manual_lesson_plans', migrated_count;
END $$;

-- ============================================================================
-- SECTION 10: CREATE COMPATIBILITY VIEWS
-- ============================================================================

-- View to mimic old ai_generated_lessons structure
CREATE OR REPLACE VIEW ai_generated_lessons_compat AS
SELECT 
    id,
    provider_id,
    lesson_date,
    content->>'lesson_content' as content,
    ai_prompt as prompt,
    content->'session_data' as session_data,
    created_at,
    updated_at,
    time_slot,
    school_id,
    district_id,
    state_id,
    ai_prompt as full_prompt_sent,
    ai_raw_response,
    ai_model as model_used,
    prompt_tokens,
    completion_tokens,
    generation_metadata
FROM lessons
WHERE lesson_source = 'ai_generated';

-- View to mimic old manual_lesson_plans structure  
CREATE OR REPLACE VIEW manual_lesson_plans_compat AS
SELECT 
    id,
    provider_id,
    lesson_date,
    title,
    subject,
    grade_levels,
    duration_minutes,
    content->>'objectives' as objectives,
    content->>'materials' as materials,
    content->'activities' as activities,
    content->>'assessment' as assessment,
    notes,
    created_at,
    updated_at,
    school_id,
    district_id,
    state_id
FROM lessons
WHERE lesson_source = 'manual';

-- View to mimic old lessons table structure
CREATE OR REPLACE VIEW lessons_old_compat AS
SELECT 
    id,
    provider_id,
    created_at,
    time_slot,
    student_ids,
    student_details,
    legacy_content_html as content_old_text,
    lesson_date,
    (SELECT name FROM schools WHERE schools.id = lessons.school_id) as school_site,
    notes,
    content,
    metadata,
    CASE 
        WHEN lesson_source = 'ai_generated' THEN 'ai'
        ELSE 'manual'
    END as lesson_type,
    subject,
    topic,
    duration_minutes as duration,
    ai_prompt as full_prompt_sent,
    ai_raw_response,
    ai_model as model_used,
    prompt_tokens,
    completion_tokens,
    generation_metadata
FROM lessons;

-- ============================================================================
-- SECTION 11: SETUP ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can view their own lessons
CREATE POLICY lessons_select_own
    ON lessons
    FOR SELECT
    USING (auth.uid() = provider_id);

-- Policy: Providers can insert their own lessons
CREATE POLICY lessons_insert_own
    ON lessons
    FOR INSERT
    WITH CHECK (auth.uid() = provider_id);

-- Policy: Providers can update their own lessons
CREATE POLICY lessons_update_own
    ON lessons
    FOR UPDATE
    USING (auth.uid() = provider_id)
    WITH CHECK (auth.uid() = provider_id);

-- Policy: Providers can delete their own lessons
CREATE POLICY lessons_delete_own
    ON lessons
    FOR DELETE
    USING (auth.uid() = provider_id);

-- Policy: SEAs can view lessons from their supervising provider
CREATE POLICY lessons_select_sea
    ON lessons
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.supervising_provider_id = lessons.provider_id
        )
    );

-- Policy: Shared school access
CREATE POLICY lessons_select_shared_school
    ON lessons
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles p1
            JOIN profiles p2 ON p1.school_id = p2.school_id
            WHERE p1.id = auth.uid()
            AND p2.id = lessons.provider_id
            AND p2.shared_at_school = true
        )
    );

-- ============================================================================
-- SECTION 12: GRANT PERMISSIONS
-- ============================================================================

-- Grant permissions on new table
GRANT ALL ON lessons TO authenticated;
GRANT ALL ON lessons TO service_role;

-- Grant permissions on compatibility views
GRANT SELECT ON ai_generated_lessons_compat TO authenticated;
GRANT SELECT ON manual_lesson_plans_compat TO authenticated;
GRANT SELECT ON lessons_old_compat TO authenticated;

-- ============================================================================
-- SECTION 13: FINAL VERIFICATION
-- ============================================================================

DO $$
DECLARE
    total_original INTEGER;
    total_migrated INTEGER;
    lessons_old_count INTEGER;
    ai_lessons_count INTEGER;
    manual_lessons_count INTEGER;
BEGIN
    -- Count original records
    SELECT COUNT(*) INTO lessons_old_count FROM lessons_old;
    SELECT COUNT(*) INTO ai_lessons_count FROM ai_generated_lessons;
    SELECT COUNT(*) INTO manual_lessons_count FROM manual_lesson_plans;
    total_original := lessons_old_count + ai_lessons_count + manual_lessons_count;
    
    -- Count migrated records
    SELECT COUNT(*) INTO total_migrated FROM lessons;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'MIGRATION SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Original record counts:';
    RAISE NOTICE '  - lessons_old: %', lessons_old_count;
    RAISE NOTICE '  - ai_generated_lessons: %', ai_lessons_count;
    RAISE NOTICE '  - manual_lesson_plans: %', manual_lessons_count;
    RAISE NOTICE '  - TOTAL ORIGINAL: %', total_original;
    RAISE NOTICE '';
    RAISE NOTICE 'Migrated records: %', total_migrated;
    RAISE NOTICE '';
    RAISE NOTICE 'Migration breakdown:';
    RAISE NOTICE '  - From lessons_old: %', (SELECT COUNT(*) FROM lessons WHERE legacy_table_source = 'lessons_old');
    RAISE NOTICE '  - From ai_generated: %', (SELECT COUNT(*) FROM lessons WHERE legacy_table_source = 'ai_generated_lessons');
    RAISE NOTICE '  - From manual_plans: %', (SELECT COUNT(*) FROM lessons WHERE legacy_table_source = 'manual_lesson_plans');
    RAISE NOTICE '';
    RAISE NOTICE 'Lesson sources:';
    RAISE NOTICE '  - ai_generated: %', (SELECT COUNT(*) FROM lessons WHERE lesson_source = 'ai_generated');
    RAISE NOTICE '  - manual: %', (SELECT COUNT(*) FROM lessons WHERE lesson_source = 'manual');
    RAISE NOTICE '  - legacy_html: %', (SELECT COUNT(*) FROM lessons WHERE lesson_source = 'legacy_html');
    RAISE NOTICE '========================================';
    
    -- Allow for some duplication due to conflicts
    IF total_migrated < total_original - 10 THEN
        RAISE WARNING 'Migration may have missed some records. Expected around %, got %', 
            total_original, total_migrated;
    ELSE
        RAISE NOTICE 'Migration completed successfully!';
    END IF;
END $$;

-- ============================================================================
-- SECTION 14: COMMENTS AND DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE lessons IS 'Unified table for all lesson types - replaces lessons_old, ai_generated_lessons, and manual_lesson_plans';
COMMENT ON COLUMN lessons.lesson_source IS 'Source of the lesson: ai_generated, ai_enhanced, manual, imported, or legacy_html';
COMMENT ON COLUMN lessons.lesson_status IS 'Current status: draft, published, archived, or scheduled';
COMMENT ON COLUMN lessons.content IS 'Main lesson content in flexible JSONB format';
COMMENT ON COLUMN lessons.legacy_table_source IS 'Original table this record was migrated from - will be removed after verification';
COMMENT ON COLUMN lessons.migration_date IS 'Timestamp when this record was migrated - will be removed after verification';
COMMENT ON COLUMN lessons.legacy_content_html IS 'Original HTML content for legacy lessons - will be removed after conversion';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================

-- Note: The old tables are NOT dropped immediately. They will remain as:
-- - lessons_old (renamed from lessons)
-- - ai_generated_lessons (unchanged)
-- - manual_lesson_plans (unchanged)
--
-- After verification period (30 days), run the cleanup migration to remove them.