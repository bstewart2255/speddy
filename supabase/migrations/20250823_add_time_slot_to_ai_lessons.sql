-- Add time_slot column to ai_generated_lessons table to support multiple lessons per day
-- Migration: 20250823_add_time_slot_to_ai_lessons.sql

-- Add time_slot column to store the time slot for each lesson (e.g., "08:00", "08:30")
ALTER TABLE public.ai_generated_lessons 
ADD COLUMN IF NOT EXISTS time_slot VARCHAR(5);

-- Assign unique time slots to existing records to preserve all data
-- For duplicates, assign incremental time slots (08:00, 08:30, 09:00, etc.)
WITH numbered_lessons AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY provider_id, lesson_date ORDER BY created_at) - 1 as slot_number
  FROM public.ai_generated_lessons
  WHERE time_slot IS NULL
)
UPDATE public.ai_generated_lessons 
SET time_slot = 
  CASE 
    WHEN nl.slot_number = 0 THEN '08:00'
    WHEN nl.slot_number = 1 THEN '08:30'
    WHEN nl.slot_number = 2 THEN '09:00'
    WHEN nl.slot_number = 3 THEN '09:30'
    WHEN nl.slot_number = 4 THEN '10:00'
    WHEN nl.slot_number = 5 THEN '10:30'
    WHEN nl.slot_number = 6 THEN '11:00'
    WHEN nl.slot_number = 7 THEN '11:30'
    WHEN nl.slot_number = 8 THEN '12:00'
    WHEN nl.slot_number = 9 THEN '12:30'
    WHEN nl.slot_number = 10 THEN '13:00'
    WHEN nl.slot_number = 11 THEN '13:30'
    WHEN nl.slot_number = 12 THEN '14:00'
    WHEN nl.slot_number = 13 THEN '14:30'
    WHEN nl.slot_number = 14 THEN '15:00'
    WHEN nl.slot_number = 15 THEN '15:30'
    WHEN nl.slot_number = 16 THEN '16:00'
    WHEN nl.slot_number = 17 THEN '16:30'
    WHEN nl.slot_number = 18 THEN '17:00'
    WHEN nl.slot_number = 19 THEN '17:30'
    WHEN nl.slot_number = 20 THEN '18:00'
    -- For any additional duplicates beyond 21, default to last reasonable slot
    ELSE '18:00'
  END
FROM numbered_lessons nl
WHERE public.ai_generated_lessons.id = nl.id;

-- Set default time slot for any remaining NULL values
UPDATE public.ai_generated_lessons 
SET time_slot = '08:00' 
WHERE time_slot IS NULL;

-- Drop existing unique constraint if it exists
ALTER TABLE public.ai_generated_lessons 
DROP CONSTRAINT IF EXISTS unique_lesson_per_day;

-- Add new composite unique constraint for provider, date, and time slot
ALTER TABLE public.ai_generated_lessons 
ADD CONSTRAINT unique_lesson_per_time_slot 
UNIQUE (provider_id, lesson_date, time_slot);

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_ai_generated_lessons_time_slot 
ON public.ai_generated_lessons(time_slot);

-- Add comment to document the new column
COMMENT ON COLUMN public.ai_generated_lessons.time_slot IS 'Time slot for the lesson (e.g., "08:00", "08:30")';