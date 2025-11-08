# AI Lessons School Context Fix - Summary

## Problem Identified

The AI lesson generation was working (lessons were being saved to the database), but the UI wasn't showing them properly. Investigation revealed that the `ai_generated_lessons` table lacked school identification columns, causing lessons from all schools to be mixed together when users work at multiple schools (e.g., Bancroft Elementary and Mt Diablo Elementary).

## Root Causes

1. **Missing School Context in Database**: The `ai_generated_lessons` table only had `provider_id` but no `school_id`, `district_id`, or `state_id` columns
2. **No School Filtering**: Lessons were loaded and saved without regard to which school was currently selected
3. **Date Mismatch**: Some lessons were being saved with future dates due to week offset issues

## Changes Made

### 1. Database Migration (`supabase/migrations/20250904_add_school_context_to_ai_lessons.sql`)

- Added `school_id`, `district_id`, and `state_id` columns to `ai_generated_lessons` table
- Added foreign key constraints to ensure data integrity
- Created composite index for efficient queries: `(provider_id, school_id, lesson_date)`
- Updated unique constraint to include `school_id`
- Also added the same columns to `manual_lesson_plans` table for consistency

### 2. Updated CalendarWeekView Component

- Imported `useSchool` hook to access current school context
- Modified lesson saving to include school context (school_id, district_id, state_id)
- Updated lesson loading to filter by current school_id
- Added school filtering to deletion operations
- Added `currentSchool` to the useEffect dependency array so lessons reload when switching schools

## How to Apply the Fix

1. **Run the database migration** to add the new columns:

   ```sql
   -- Execute the migration file: supabase/migrations/20250904_add_school_context_to_ai_lessons.sql
   ```

2. **Deploy the updated code** with the CalendarWeekView changes

3. **Test the fix**:
   - Navigate to the calendar week view
   - Generate AI lessons for a day
   - The "Saved AI Lesson" button should appear immediately
   - Switch schools using the school switcher
   - Verify that lessons are properly separated by school

## Expected Behavior After Fix

- Lessons will be saved with proper school identification
- When switching schools, only lessons for that school will be displayed
- The "Saved AI Lesson" button will appear immediately after generation
- No mixing of lessons between different schools
- Better performance due to indexed queries

## Note on Existing Data

All existing AI lessons were test data and can be deleted (the migration includes a DELETE statement). No data migration is needed.
