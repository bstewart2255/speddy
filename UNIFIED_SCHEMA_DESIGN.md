# Unified Lessons Table Schema Design

**Date:** January 2025  
**Purpose:** Complete schema design for consolidating three lesson tables into a unified structure

## Executive Summary

This document defines the complete schema for a unified `lessons` table that will replace the current three-table structure. The design prioritizes:

- Data integrity and consistency
- Performance optimization
- Backwards compatibility
- Flexibility for future features
- Proper multi-site support

## Schema Design

### Type Definitions

```sql
-- Create enum type for lesson sources
CREATE TYPE lesson_source AS ENUM (
    'ai_generated',      -- AI-generated from calendar/upcoming sessions
    'ai_enhanced',       -- AI-generated with differentiation
    'manual',           -- Manually created by provider
    'imported',         -- Imported from external source
    'legacy_html'       -- Legacy HTML format (for migration)
);

-- Create enum type for lesson status
CREATE TYPE lesson_status AS ENUM (
    'draft',            -- In progress, not finalized
    'published',        -- Ready for use
    'archived',         -- No longer active
    'scheduled'         -- Scheduled for future
);
```

### Main Table Definition

```sql
-- Drop existing tables backup (after successful migration)
-- ALTER TABLE lessons RENAME TO lessons_backup;
-- ALTER TABLE ai_generated_lessons RENAME TO ai_generated_lessons_backup;
-- ALTER TABLE manual_lesson_plans RENAME TO manual_lesson_plans_backup;

-- Create the unified lessons table
CREATE TABLE lessons (
    -- ==========================================
    -- Primary Identification
    -- ==========================================
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    lesson_source lesson_source NOT NULL DEFAULT 'manual',
    lesson_status lesson_status NOT NULL DEFAULT 'published',

    -- ==========================================
    -- Temporal Fields
    -- ==========================================
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lesson_date DATE NOT NULL,
    time_slot TEXT, -- e.g., "08:00", "08:30"

    -- ==========================================
    -- Location Context (Multi-site Support)
    -- ==========================================
    school_id VARCHAR(255) REFERENCES schools(id) ON DELETE SET NULL,
    district_id VARCHAR(255) REFERENCES districts(id) ON DELETE SET NULL,
    state_id VARCHAR(255) REFERENCES states(id) ON DELETE SET NULL,

    -- ==========================================
    -- Core Content (Flexible JSON Structure)
    -- ==========================================
    title TEXT,
    subject TEXT,
    topic TEXT,
    grade_levels TEXT[], -- Array of applicable grade levels
    duration_minutes INTEGER CHECK (duration_minutes > 0 AND duration_minutes <= 480),

    -- Main content storage (JSONB for flexibility)
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    /* Expected content structure:
    {
        "objectives": ["objective1", "objective2"],
        "materials": ["material1", "material2"],
        "activities": [
            {
                "type": "warm_up",
                "duration": 5,
                "description": "...",
                "instructions": ["step1", "step2"]
            }
        ],
        "assessment": {
            "type": "formative",
            "method": "observation",
            "criteria": ["criteria1", "criteria2"]
        },
        "differentiation": {
            "student_id": {
                "modifications": ["mod1", "mod2"],
                "accommodations": ["acc1", "acc2"]
            }
        },
        "worksheets": [
            {
                "title": "Worksheet 1",
                "content": "...",
                "answer_key": "..."
            }
        ]
    }
    */

    -- ==========================================
    -- Student Association
    -- ==========================================
    student_ids UUID[], -- Array of student IDs this lesson applies to
    student_details JSONB, -- Cached student information at time of generation

    -- ==========================================
    -- Metadata and Notes
    -- ==========================================
    metadata JSONB DEFAULT '{}'::jsonb,
    /* Expected metadata structure:
    {
        "tags": ["tag1", "tag2"],
        "standards": ["CCSS.MATH.1.OA.1"],
        "prerequisites": ["skill1", "skill2"],
        "difficulty_level": "medium",
        "estimated_prep_time": 10,
        "resources_url": "https://...",
        "teacher_notes": "...",
        "reflection": "...",
        "version": "1.0.0"
    }
    */
    notes TEXT, -- General notes field

    -- ==========================================
    -- AI Generation Tracking
    -- ==========================================
    ai_model VARCHAR(50), -- e.g., "gpt-4", "claude-3"
    ai_prompt TEXT, -- The prompt used for generation
    ai_raw_response JSONB, -- Complete AI response for debugging
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    generation_metadata JSONB,
    /* Expected generation_metadata structure:
    {
        "temperature": 0.7,
        "max_tokens": 2000,
        "generation_time_ms": 3500,
        "retry_count": 0,
        "error_messages": [],
        "confidence_score": 0.95
    }
    */

    -- ==========================================
    -- Legacy Support (for migration)
    -- ==========================================
    legacy_content_html TEXT, -- Temporary field for HTML content during migration
    legacy_table_source TEXT, -- Track which table this came from
    migration_date TIMESTAMPTZ, -- When this record was migrated

    -- ==========================================
    -- Constraints
    -- ==========================================
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

-- ==========================================
-- Indexes for Performance
-- ==========================================

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

-- Status filtering
CREATE INDEX idx_lessons_status
    ON lessons(lesson_status);

-- Source type filtering
CREATE INDEX idx_lessons_source
    ON lessons(lesson_source);

-- Migration tracking
CREATE INDEX idx_lessons_migration
    ON lessons(legacy_table_source, migration_date)
    WHERE legacy_table_source IS NOT NULL;
```

### Supporting Functions

```sql
-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
CREATE TRIGGER lessons_updated_at_trigger
    BEFORE UPDATE ON lessons
    FOR EACH ROW
    EXECUTE FUNCTION update_lessons_updated_at();

-- Function to validate content structure
CREATE OR REPLACE FUNCTION validate_lesson_content(content JSONB)
RETURNS BOOLEAN AS $$
BEGIN
    -- Ensure content is an object
    IF jsonb_typeof(content) != 'object' THEN
        RETURN FALSE;
    END IF;

    -- Add more validation as needed
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Add constraint for content validation
ALTER TABLE lessons
    ADD CONSTRAINT lessons_valid_content
    CHECK (validate_lesson_content(content));
```

### Row Level Security (RLS) Policies

```sql
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

-- Policy: Shared school access (for shared_at_school feature)
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
```

### Migration Views (Temporary for Backwards Compatibility)

```sql
-- View to mimic old ai_generated_lessons structure
CREATE VIEW ai_generated_lessons_compat AS
SELECT
    id,
    provider_id,
    lesson_date,
    content::text as content,
    ai_prompt as prompt,
    metadata->>'session_data' as session_data,
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
CREATE VIEW manual_lesson_plans_compat AS
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

-- Grant appropriate permissions on views
GRANT SELECT ON ai_generated_lessons_compat TO authenticated;
GRANT SELECT ON manual_lesson_plans_compat TO authenticated;
```

## Design Decisions and Rationale

### 1. JSONB for Content Storage

**Decision:** Use JSONB for the main content field  
**Rationale:**

- Provides flexibility for different lesson types
- Allows schema evolution without migrations
- Supports efficient querying with GIN indexes
- Maintains structure while allowing variation

### 2. Enum Types for Classification

**Decision:** Use PostgreSQL enum types for lesson_source and lesson_status  
**Rationale:**

- Type safety at database level
- Better performance than text checks
- Clear documentation of valid values
- Easy to extend with ALTER TYPE

### 3. Separate Fields for Common Attributes

**Decision:** Keep title, subject, topic, duration as separate columns  
**Rationale:**

- Frequently queried fields benefit from direct access
- Easier indexing and filtering
- Cleaner API responses
- Better performance for common operations

### 4. Array Types for Multi-value Fields

**Decision:** Use arrays for student_ids and grade_levels  
**Rationale:**

- Native PostgreSQL array support with GIN indexing
- Efficient containment queries
- Simpler than junction tables for this use case
- Direct mapping to frontend array structures

### 5. Unique Constraint Strategy

**Decision:** Unique on (provider_id, school_id, lesson_date, time_slot)  
**Rationale:**

- Prevents double-booking in calendar view
- Allows same lesson at different schools
- Nullable time_slot for non-scheduled lessons
- Matches current business logic

### 6. Legacy Support Fields

**Decision:** Include temporary migration fields  
**Rationale:**

- Ensures no data loss during migration
- Allows gradual migration and rollback
- Provides audit trail of data source
- Can be removed after verification period

## Migration Strategy

### Phase 1: Pre-Migration Preparation

```sql
-- Create backup tables
CREATE TABLE lessons_backup AS SELECT * FROM lessons;
CREATE TABLE ai_generated_lessons_backup AS SELECT * FROM ai_generated_lessons;
CREATE TABLE manual_lesson_plans_backup AS SELECT * FROM manual_lesson_plans;

-- Add migration tracking
ALTER TABLE lessons_backup ADD COLUMN backup_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE ai_generated_lessons_backup ADD COLUMN backup_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE manual_lesson_plans_backup ADD COLUMN backup_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
```

### Phase 2: Schema Creation

```sql
-- Run the complete schema definition from above
-- This creates the new unified table with all indexes and constraints
```

### Phase 3: Data Migration

```sql
-- Detailed migration scripts will be in separate migration files
-- See MIGRATION_SCRIPTS.md for complete scripts
```

### Phase 4: Verification

```sql
-- Verification queries
SELECT
    legacy_table_source,
    lesson_source,
    COUNT(*) as record_count
FROM lessons
GROUP BY legacy_table_source, lesson_source
ORDER BY legacy_table_source;

-- Check for any missing records
SELECT COUNT(*) as original_lessons FROM lessons_backup;
SELECT COUNT(*) as original_ai FROM ai_generated_lessons_backup;
SELECT COUNT(*) as original_manual FROM manual_lesson_plans_backup;
SELECT COUNT(*) as migrated_total FROM lessons;
```

### Phase 5: Cleanup (After 30-day verification)

```sql
-- Drop compatibility views
DROP VIEW IF EXISTS ai_generated_lessons_compat;
DROP VIEW IF EXISTS manual_lesson_plans_compat;

-- Drop backup tables
DROP TABLE IF EXISTS lessons_backup;
DROP TABLE IF EXISTS ai_generated_lessons_backup;
DROP TABLE IF EXISTS manual_lesson_plans_backup;

-- Remove legacy columns
ALTER TABLE lessons
    DROP COLUMN legacy_content_html,
    DROP COLUMN legacy_table_source,
    DROP COLUMN migration_date;
```

## Performance Considerations

### Expected Query Patterns

1. **Calendar View:** Provider + School + Date Range
   - Optimized with `idx_lessons_calendar_lookup`
2. **Student Lessons:** Student ID containment
   - Optimized with GIN index on `student_ids`
3. **Subject/Topic Browse:** Subject + Topic filtering
   - Optimized with `idx_lessons_subject_topic`
4. **Recent Lessons:** Provider + Date ordering
   - Optimized with `idx_lessons_provider_date`

### Index Strategy

- Composite indexes for common query patterns
- GIN indexes for JSONB and array fields
- Partial indexes for filtered queries
- Covering indexes where beneficial

### Storage Estimates

- Average lesson size: ~5-10 KB
- Current total records: 168
- Projected 1-year growth: ~10,000 records
- Total storage need: ~100 MB (including indexes)

## Security Considerations

### RLS Implementation

- All access controlled through RLS policies
- No direct table access without authentication
- Hierarchical access (provider -> SEA)
- School-based sharing when enabled

### Data Privacy

- Student PII stored in separate student_details JSONB
- No sensitive data in indexed fields
- Audit trail through created_at/updated_at
- Provider isolation enforced at database level

## API Integration Guidelines

### Reading Lessons

```typescript
// TypeScript interface matching the schema
interface Lesson {
  id: string;
  provider_id: string;
  lesson_source: 'ai_generated' | 'ai_enhanced' | 'manual' | 'imported' | 'legacy_html';
  lesson_status: 'draft' | 'published' | 'archived' | 'scheduled';
  created_at: string;
  updated_at: string;
  lesson_date: string;
  time_slot?: string;
  school_id?: string;
  district_id?: string;
  state_id?: string;
  title?: string;
  subject?: string;
  topic?: string;
  grade_levels?: string[];
  duration_minutes?: number;
  content: LessonContent;
  student_ids?: string[];
  student_details?: any;
  metadata?: LessonMetadata;
  notes?: string;
  ai_model?: string;
  ai_prompt?: string;
  ai_raw_response?: any;
  prompt_tokens?: number;
  completion_tokens?: number;
  generation_metadata?: any;
}
```

### Writing Lessons

```sql
-- Example insert for AI-generated lesson
INSERT INTO lessons (
    provider_id,
    lesson_source,
    lesson_date,
    time_slot,
    school_id,
    title,
    subject,
    content,
    student_ids,
    ai_model,
    ai_prompt,
    prompt_tokens,
    completion_tokens
) VALUES (
    $1, -- provider_id
    'ai_generated',
    $2, -- lesson_date
    $3, -- time_slot
    $4, -- school_id
    $5, -- title
    $6, -- subject
    $7, -- content (JSONB)
    $8, -- student_ids (array)
    'gpt-4',
    $9, -- prompt
    $10, -- prompt_tokens
    $11  -- completion_tokens
);
```

## Success Metrics

1. **Data Integrity**
   - All 168 records migrated successfully
   - No data loss or corruption
   - Relationships maintained

2. **Performance**
   - Query response < 100ms for common patterns
   - Index usage > 90% for main queries
   - No full table scans in production

3. **Compatibility**
   - All existing features continue working
   - Smooth transition with compatibility views
   - No breaking changes for 30 days

4. **Maintainability**
   - Single source of truth for lessons
   - Consistent data structure
   - Clear migration path for future changes

## Next Steps

1. **Review and Approval**
   - Technical review of schema design
   - Security review of RLS policies
   - Performance review of indexes

2. **Implementation**
   - Create migration scripts
   - Test in development environment
   - Deploy to staging for validation

3. **Monitoring**
   - Track query performance
   - Monitor storage usage
   - Collect error logs

4. **Documentation**
   - Update API documentation
   - Create developer guide
   - Document migration process
