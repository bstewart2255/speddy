-- ============================================================================
-- SIMPLIFIED UNIFIED LESSONS TABLE MIGRATION
-- Date: 2025-01-28
-- Purpose: Replace 3 lesson tables with one unified table
-- No production data = No complex safety nets needed
-- ============================================================================

-- Drop old tables (CASCADE removes dependent objects)
DROP TABLE IF EXISTS lessons CASCADE;
DROP TABLE IF EXISTS ai_generated_lessons CASCADE;
DROP TABLE IF EXISTS manual_lesson_plans CASCADE;
DROP TABLE IF EXISTS differentiated_lessons CASCADE;

-- Drop old types if they exist
DROP TYPE IF EXISTS lesson_source CASCADE;
DROP TYPE IF EXISTS lesson_status CASCADE;

-- ============================================================================
-- CREATE TYPE DEFINITIONS
-- ============================================================================

CREATE TYPE lesson_source AS ENUM (
    'ai_generated',      -- AI-generated lessons
    'ai_enhanced',       -- AI with differentiation
    'manual',           -- Manually created
    'imported'          -- Future: imported from external
);

CREATE TYPE lesson_status AS ENUM (
    'draft',            -- Work in progress
    'published',        -- Ready to use
    'archived'          -- No longer active
);

-- ============================================================================
-- CREATE UNIFIED LESSONS TABLE
-- ============================================================================

CREATE TABLE lessons (
    -- Primary Identity
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lesson_source lesson_source NOT NULL DEFAULT 'manual',
    lesson_status lesson_status NOT NULL DEFAULT 'published',
    
    -- Temporal
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lesson_date DATE NOT NULL,
    time_slot TEXT, -- "08:00", "08:30", etc
    
    -- Location (Multi-site)
    school_id VARCHAR(255) REFERENCES schools(id) ON DELETE SET NULL,
    district_id VARCHAR(255) REFERENCES districts(id) ON DELETE SET NULL,
    state_id VARCHAR(255) REFERENCES states(id) ON DELETE SET NULL,
    
    -- Core Content
    title TEXT,
    subject TEXT,
    topic TEXT,
    grade_levels TEXT[],
    duration_minutes INTEGER CHECK (duration_minutes > 0 AND duration_minutes <= 480),
    
    -- Flexible JSON content
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    /* Expected structure:
    {
        "objectives": [],
        "materials": [],
        "activities": [],
        "assessment": {},
        "differentiation": {},
        "worksheets": []
    }
    */
    
    -- Student Association
    student_ids UUID[],
    student_details JSONB,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    notes TEXT,
    
    -- AI Generation Tracking
    ai_model VARCHAR(50),
    ai_prompt TEXT,
    ai_raw_response JSONB,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    generation_metadata JSONB,
    
    -- Constraints
    CONSTRAINT lessons_unique_calendar 
        UNIQUE (provider_id, school_id, lesson_date, time_slot),
    
    CONSTRAINT lessons_ai_consistency 
        CHECK (
            (lesson_source IN ('ai_generated', 'ai_enhanced') AND ai_model IS NOT NULL) OR
            (lesson_source NOT IN ('ai_generated', 'ai_enhanced'))
        )
);

-- ============================================================================
-- CREATE INDEXES
-- ============================================================================

-- Primary queries
CREATE INDEX idx_lessons_provider_date ON lessons(provider_id, lesson_date DESC);
CREATE INDEX idx_lessons_calendar ON lessons(provider_id, school_id, lesson_date, time_slot);

-- Search and filters
CREATE INDEX idx_lessons_student_ids ON lessons USING GIN(student_ids);
CREATE INDEX idx_lessons_content ON lessons USING GIN(content);
CREATE INDEX idx_lessons_grade_levels ON lessons USING GIN(grade_levels);
CREATE INDEX idx_lessons_subject ON lessons(subject) WHERE subject IS NOT NULL;
CREATE INDEX idx_lessons_status ON lessons(lesson_status);
CREATE INDEX idx_lessons_source ON lessons(lesson_source);

-- ============================================================================
-- CREATE UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER lessons_updated_at
    BEFORE UPDATE ON lessons
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ENABLE RLS
-- ============================================================================

ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Providers see their own lessons
CREATE POLICY lessons_provider_access ON lessons
    FOR ALL
    USING (auth.uid() = provider_id)
    WITH CHECK (auth.uid() = provider_id);

-- SEAs see their supervisor's lessons
CREATE POLICY lessons_sea_access ON lessons
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.supervising_provider_id = lessons.provider_id
        )
    );

-- ============================================================================
-- DONE! 
-- ============================================================================

-- No complex migrations, no backwards compatibility views, no cleanup phases
-- Just a clean, new table ready to use