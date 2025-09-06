-- ============================================================================
-- FIX LESSONS UNIQUE CONSTRAINT
-- Date: 2025-09-06
-- Purpose: Adjust unique constraint to allow multiple AI-generated lessons
-- ============================================================================

-- Drop the overly restrictive constraint
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_unique_calendar;

-- Add a more appropriate constraint that only applies to calendar lessons
-- This ensures only one lesson per calendar time slot, but allows multiple
-- lessons with time_slot = 'structured' (from the Lessons page)
CREATE UNIQUE INDEX lessons_unique_calendar_timeslot 
ON lessons (provider_id, school_id, lesson_date, time_slot)
WHERE time_slot IS NOT NULL 
  AND time_slot != 'structured';

-- This allows:
-- 1. Multiple AI lessons from the Lessons page (they use time_slot = 'structured')
-- 2. Multiple manual lessons without a time_slot
-- 3. Only one lesson per specific calendar time slot (morning, afternoon, etc.)