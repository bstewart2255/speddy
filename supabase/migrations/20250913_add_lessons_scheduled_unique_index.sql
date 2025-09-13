-- Migration: Add partial unique index for scheduled lessons
-- Date: 2025-09-13
-- Purpose: Allow duplicate on-demand lessons while preventing duplicate scheduled lessons

-- Create a partial unique index for scheduled lessons only
-- This allows multiple on-demand lessons (which have unique timestamps)
-- but prevents duplicate scheduled lessons for the same time slot
CREATE UNIQUE INDEX IF NOT EXISTS lessons_scheduled_unique 
ON lessons (provider_id, school_id, lesson_date, time_slot)
WHERE time_slot NOT LIKE 'on-demand-%';

-- Note: This migration is optional and only needed if you want to:
-- 1. Prevent duplicate scheduled lessons in the same time slot
-- 2. Use upsert with onConflict for scheduled lessons
-- 
-- The current code works without this migration by using INSERT for all lessons