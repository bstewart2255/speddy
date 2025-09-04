# AI Lessons Constraint Fix (IMPORTANT - Run This Migration!)

## Problem Found

After running the first migration, lessons still weren't saving because there are TWO unique constraints on the `ai_generated_lessons` table:

1. The NEW constraint: `ai_generated_lessons_unique_lesson` with columns `(provider_id, school_id, lesson_date, time_slot)`
2. The OLD constraint: `unique_lesson_per_time_slot` with columns `(provider_id, lesson_date, time_slot)` - missing school_id!

The old constraint is blocking inserts because it doesn't include `school_id`, causing a unique constraint violation.

## Solution

Run the new migration file: `supabase/migrations/20250904_fix_ai_lessons_constraints.sql`

This migration will:

1. Drop the old `unique_lesson_per_time_slot` constraint
2. Drop any other legacy constraint variants
3. Ensure the new constraint with school_id exists
4. Log the remaining constraints for verification

## Steps to Fix

1. **Run the second migration**:

   ```sql
   -- Execute: supabase/migrations/20250904_fix_ai_lessons_constraints.sql
   ```

2. **Test again** - The lessons should now save properly

## Enhanced Logging

The CalendarWeekView component now includes:

- Detailed error logging with error codes and hints
- School context logging to verify it's being captured
- Success confirmation logs when lessons are saved
- Better error details to help diagnose any remaining issues

## What to Look for in Console

When generating lessons, you should see:

1. `Current school context:` - Shows if school_id is populated
2. Either:
   - `Successfully saved lesson to database:` - Good!
   - `Failed to save AI lesson to database:` - Check the error details

If school_id is null in the logs, that means the school context isn't being passed properly and we need to investigate the SchoolContext provider.
