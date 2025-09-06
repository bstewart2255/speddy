# Lesson Tables Analysis and Migration Strategy

**Date:** January 2025  
**Purpose:** Comprehensive analysis of three lesson tables for consolidation into a unified system

## Executive Summary

The Speddy application currently has three separate tables storing lesson data:

- `lessons` (129 records) - Mixed legacy HTML and new JSON format
- `ai_generated_lessons` (36 records) - AI-generated lessons from calendar/upcoming sessions
- `manual_lesson_plans` (3 records) - Manual lesson entry system

This fragmentation causes maintenance burden, confusion, and prevents efficient feature development. This document provides a complete analysis for consolidating these tables.

## Table Structure Analysis

### 1. `lessons` Table (129 records)

**Purpose:** Primary lesson storage, currently storing both legacy HTML and new JSON format lessons

| Field               | Type        | Nullable | Default                | Description                                    |
| ------------------- | ----------- | -------- | ---------------------- | ---------------------------------------------- |
| id                  | uuid        | NO       | gen_random_uuid()      | Primary key                                    |
| provider_id         | uuid        | NO       | -                      | Reference to auth.users                        |
| created_at          | timestamptz | NO       | timezone('utc', now()) | Creation timestamp                             |
| time_slot           | text        | YES      | -                      | Time slot (e.g., "08:00")                      |
| student_ids         | text[]      | NO       | -                      | Array of student IDs                           |
| student_details     | jsonb       | YES      | -                      | Cached student information                     |
| content_old_text    | text        | YES      | -                      | Legacy HTML content (8 records still use this) |
| lesson_date         | date        | YES      | -                      | Date of lesson                                 |
| school_site         | text        | YES      | -                      | School name (free text)                        |
| notes               | text        | YES      | -                      | Additional notes                               |
| content             | jsonb       | YES      | -                      | New JSON format content (121 records)          |
| metadata            | jsonb       | YES      | -                      | Additional metadata                            |
| lesson_type         | text        | YES      | -                      | Type of lesson                                 |
| subject             | text        | YES      | -                      | Subject area                                   |
| topic               | text        | YES      | -                      | Lesson topic                                   |
| duration            | integer     | YES      | -                      | Duration in minutes                            |
| full_prompt_sent    | text        | YES      | -                      | AI prompt used                                 |
| ai_raw_response     | jsonb       | YES      | -                      | Raw AI response                                |
| model_used          | varchar(50) | YES      | -                      | AI model identifier                            |
| prompt_tokens       | integer     | YES      | -                      | Token count for prompt                         |
| completion_tokens   | integer     | YES      | -                      | Token count for completion                     |
| generation_metadata | jsonb       | YES      | -                      | Generation metadata                            |

**Issues:**

- Mixed formats (HTML vs JSON)
- No school_id/district_id for proper multi-site support
- Inconsistent usage of fields

### 2. `ai_generated_lessons` Table (36 records)

**Purpose:** Stores AI-generated lessons from Calendar and Upcoming Sessions widgets

| Field               | Type         | Nullable | Default           | Description                  |
| ------------------- | ------------ | -------- | ----------------- | ---------------------------- |
| id                  | uuid         | NO       | gen_random_uuid() | Primary key                  |
| provider_id         | uuid         | NO       | -                 | Reference to profiles        |
| lesson_date         | date         | NO       | -                 | Date of lesson               |
| content             | text         | YES      | -                 | Lesson content (text format) |
| prompt              | text         | YES      | -                 | Original prompt              |
| session_data        | jsonb        | YES      | -                 | Session information          |
| created_at          | timestamptz  | NO       | now()             | Creation timestamp           |
| updated_at          | timestamptz  | NO       | now()             | Update timestamp             |
| time_slot           | varchar(20)  | YES      | -                 | Time slot                    |
| school_id           | varchar(255) | YES      | -                 | NCES School ID               |
| district_id         | varchar(255) | YES      | -                 | NCES District ID             |
| state_id            | varchar(255) | YES      | -                 | State code                   |
| full_prompt_sent    | text         | YES      | -                 | Complete prompt              |
| ai_raw_response     | jsonb        | YES      | -                 | Raw AI response              |
| model_used          | varchar(50)  | YES      | -                 | AI model                     |
| prompt_tokens       | integer      | YES      | -                 | Prompt tokens                |
| completion_tokens   | integer      | YES      | -                 | Completion tokens            |
| generation_metadata | jsonb        | YES      | -                 | Generation metadata          |

**Unique Constraint:** `(provider_id, school_id, lesson_date, time_slot)`

**Issues:**

- Content stored as text instead of JSON
- Duplicates functionality with lessons table
- Different field naming conventions

### 3. `manual_lesson_plans` Table (3 records)

**Purpose:** Manual lesson plan entry system

| Field            | Type         | Nullable | Default           | Description           |
| ---------------- | ------------ | -------- | ----------------- | --------------------- |
| id               | uuid         | NO       | gen_random_uuid() | Primary key           |
| provider_id      | uuid         | NO       | -                 | Reference to profiles |
| lesson_date      | date         | NO       | -                 | Date of lesson        |
| title            | text         | NO       | -                 | Lesson title          |
| subject          | text         | YES      | -                 | Subject area          |
| grade_levels     | text[]       | YES      | -                 | Array of grade levels |
| duration_minutes | integer      | YES      | -                 | Duration in minutes   |
| objectives       | text         | YES      | -                 | Learning objectives   |
| materials        | text         | YES      | -                 | Required materials    |
| activities       | jsonb        | YES      | -                 | Lesson activities     |
| assessment       | text         | YES      | -                 | Assessment methods    |
| notes            | text         | YES      | -                 | Additional notes      |
| created_at       | timestamptz  | NO       | now()             | Creation timestamp    |
| updated_at       | timestamptz  | NO       | now()             | Update timestamp      |
| school_id        | varchar(255) | YES      | -                 | NCES School ID        |
| district_id      | varchar(255) | YES      | -                 | NCES District ID      |
| state_id         | varchar(255) | YES      | -                 | State code            |

**Issues:**

- Separate table for essentially same data
- Different field structure from other tables
- Limited usage (only 3 records)

## Field Comparison Matrix

| Field Category      | lessons        | ai_generated_lessons | manual_lesson_plans |
| ------------------- | -------------- | -------------------- | ------------------- |
| **Identity**        |
| id                  | ✓              | ✓                    | ✓                   |
| provider_id         | ✓ (auth.users) | ✓ (profiles)         | ✓ (profiles)        |
| **Temporal**        |
| created_at          | ✓              | ✓                    | ✓                   |
| updated_at          | -              | ✓                    | ✓                   |
| lesson_date         | ✓              | ✓                    | ✓                   |
| time_slot           | ✓ (text)       | ✓ (varchar)          | -                   |
| **Location**        |
| school_site         | ✓ (text)       | -                    | -                   |
| school_id           | -              | ✓                    | ✓                   |
| district_id         | -              | ✓                    | ✓                   |
| state_id            | -              | ✓                    | ✓                   |
| **Content**         |
| content             | ✓ (jsonb)      | ✓ (text)             | -                   |
| content_old_text    | ✓              | -                    | -                   |
| title               | -              | -                    | ✓                   |
| subject             | ✓              | -                    | ✓                   |
| topic               | ✓              | -                    | -                   |
| objectives          | -              | -                    | ✓                   |
| materials           | -              | -                    | ✓                   |
| activities          | -              | -                    | ✓ (jsonb)           |
| assessment          | -              | -                    | ✓                   |
| notes               | ✓              | -                    | ✓                   |
| **Students**        |
| student_ids         | ✓ (array)      | -                    | -                   |
| student_details     | ✓ (jsonb)      | -                    | -                   |
| grade_levels        | -              | -                    | ✓ (array)           |
| **Duration**        |
| duration            | ✓ (integer)    | -                    | -                   |
| duration_minutes    | -              | -                    | ✓ (integer)         |
| **AI Generation**   |
| full_prompt_sent    | ✓              | ✓                    | -                   |
| ai_raw_response     | ✓              | ✓                    | -                   |
| model_used          | ✓              | ✓                    | -                   |
| prompt_tokens       | ✓              | ✓                    | -                   |
| completion_tokens   | ✓              | ✓                    | -                   |
| generation_metadata | ✓              | ✓                    | -                   |
| prompt              | -              | ✓                    | -                   |
| **Other**           |
| metadata            | ✓              | -                    | -                   |
| lesson_type         | ✓              | -                    | -                   |
| session_data        | -              | ✓                    | -                   |

## Common Fields Across All Tables

1. **Core Identity:**
   - id (uuid)
   - provider_id (uuid)
   - lesson_date (date)
   - created_at (timestamptz)

2. **School Context (partially common):**
   - school_id, district_id, state_id (in ai_generated_lessons and manual_lesson_plans)
   - school_site (only in lessons table as free text)

## Data Usage Patterns in Codebase

### 1. API Endpoints

| Endpoint                   | Table                  | Usage                                   |
| -------------------------- | ---------------------- | --------------------------------------- |
| `/api/lessons/generate`    | ai_generated_lessons   | Save AI-generated lessons from calendar |
| `/api/lessons/[id]/render` | lessons                | Render lesson content                   |
| `/api/save-lesson`         | lessons                | Save lessons from Lessons page          |
| `/api/manual-lessons`      | manual_lesson_plans    | CRUD for manual lessons                 |
| `/api/ai-lessons/generate` | differentiated_lessons | Advanced AI generation                  |

### 2. Components

| Component                 | Tables Used                               | Purpose                              |
| ------------------------- | ----------------------------------------- | ------------------------------------ |
| calendar-week-view.tsx    | ai_generated_lessons, manual_lesson_plans | Display/generate lessons in calendar |
| group-sessions-widget.tsx | ai_generated_lessons                      | Upcoming sessions lesson generation  |
| lesson-builder.tsx        | lessons                                   | Lessons page interface               |
| ai-content-modal.tsx      | Various                                   | Display lesson content               |

### 3. Generation Systems

| System              | Location              | Output Table                    |
| ------------------- | --------------------- | ------------------------------- |
| Basic JSON          | /lib/lessons/         | lessons                         |
| AI Enhanced         | /lib/ai-lessons/      | lessons, differentiated_lessons |
| Calendar Generation | /api/lessons/generate | ai_generated_lessons            |
| Manual Entry        | /api/manual-lessons   | manual_lesson_plans             |

## Migration Strategy

### Proposed Unified Schema

```sql
CREATE TABLE lessons_unified (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES profiles(id),
  lesson_type TEXT NOT NULL CHECK (lesson_type IN ('ai', 'manual', 'legacy')),

  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lesson_date DATE NOT NULL,
  time_slot TEXT,

  -- Location (normalized)
  school_id VARCHAR(255) REFERENCES schools(id),
  district_id VARCHAR(255) REFERENCES districts(id),
  state_id VARCHAR(255) REFERENCES states(id),

  -- Content (unified JSON structure)
  content JSONB NOT NULL,
  metadata JSONB,

  -- Common fields
  title TEXT,
  subject TEXT,
  topic TEXT,
  duration_minutes INTEGER,
  notes TEXT,

  -- Student association
  student_ids UUID[],
  student_details JSONB,
  grade_levels TEXT[],

  -- AI generation tracking (nullable for manual)
  full_prompt_sent TEXT,
  ai_raw_response JSONB,
  model_used VARCHAR(50),
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  generation_metadata JSONB,

  -- Constraints
  CONSTRAINT lessons_unified_unique_calendar
    UNIQUE (provider_id, school_id, lesson_date, time_slot)
);
```

### Data Mapping Plan

#### From `lessons` table:

- Migrate all 129 records
- Convert 8 HTML records to JSON format
- Set lesson_type = 'legacy' for old HTML, 'ai' for JSON
- Map school_site to proper school_id via lookup

#### From `ai_generated_lessons` table:

- Migrate all 36 records
- Set lesson_type = 'ai'
- Convert text content to JSON structure
- Preserve all school context fields

#### From `manual_lesson_plans` table:

- Migrate all 3 records
- Set lesson_type = 'manual'
- Combine separate fields into unified JSON content structure
- Map duration_minutes directly

### Migration Phases

1. **Phase 1: Data Preparation**
   - Convert HTML to JSON (8 records)
   - Validate all data integrity
   - Create backup of all tables

2. **Phase 2: Schema Creation**
   - Create new unified table
   - Add indexes and constraints
   - Set up RLS policies

3. **Phase 3: Data Migration**
   - Migrate lessons table data
   - Migrate ai_generated_lessons data
   - Migrate manual_lesson_plans data
   - Verify record counts and data integrity

4. **Phase 4: Application Updates**
   - Update all API endpoints
   - Update all component queries
   - Add backwards compatibility layer

5. **Phase 5: Cleanup**
   - Archive old tables
   - Remove deprecated code
   - Update documentation

## Risk Assessment

### High Risk Areas:

1. **Data Loss**: 168 total records across three tables
   - Mitigation: Complete backup before migration
2. **Breaking Changes**: Multiple endpoints and components depend on current structure
   - Mitigation: Backwards compatibility layer during transition

3. **Unique Constraint Conflicts**: Different uniqueness rules across tables
   - Mitigation: Careful deduplication during migration

### Low Risk Areas:

1. Small data volume (168 total records)
2. Clear mapping between fields
3. Most fields are nullable, allowing flexible migration

## Recommendations

1. **Immediate Actions:**
   - Create complete backup of all three tables
   - Write migration scripts with rollback capability
   - Set up test environment for migration validation

2. **Schema Design Decisions:**
   - Use JSONB for content to maintain flexibility
   - Keep lesson_type field for differentiation
   - Normalize school context with proper foreign keys
   - Maintain all AI tracking fields for analytics

3. **Implementation Order:**
   - Start with schema creation and test migrations
   - Update read operations first (non-breaking)
   - Then update write operations with compatibility layer
   - Finally remove old tables after verification period

## Success Metrics

- All 168 records successfully migrated
- Zero data loss during migration
- All existing features continue working
- 50% reduction in code complexity
- Single source of truth for all lesson data
- Improved query performance with proper indexes

## Next Steps

1. Review and approve this analysis
2. Create detailed migration scripts
3. Set up test environment
4. Execute migration in phases
5. Monitor and validate results
6. Archive old tables after 30-day verification period
