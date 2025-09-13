-- Migration: Add partial unique index for scheduled lessons
-- Date: 2025-09-13
-- Purpose: Allow duplicate on-demand lessons while preventing duplicate scheduled lessons

-- IMPORTANT: First, we need to handle existing duplicate lessons
-- These are old on-demand lessons that used 'structured' as default time_slot

-- Step 1: Update existing 'structured' time_slot lessons to have unique identifiers
-- This converts them to the new on-demand format with timestamps
UPDATE lessons 
SET time_slot = CONCAT('on-demand-', id)
WHERE time_slot = 'structured';

-- Step 2: Create a partial unique index for scheduled lessons only
-- This allows multiple on-demand lessons (which have unique timestamps)
-- but prevents duplicate scheduled lessons for the same time slot
-- The constraint only applies to non-on-demand lessons
CREATE UNIQUE INDEX IF NOT EXISTS lessons_scheduled_unique 
ON lessons (provider_id, school_id, lesson_date, time_slot)
WHERE time_slot NOT LIKE 'on-demand-%';

-- Note: After this migration:
-- 1. All existing 'structured' lessons are converted to unique on-demand format
-- 2. Future scheduled lessons will have duplicate prevention
-- 3. On-demand lessons can still be created multiple times