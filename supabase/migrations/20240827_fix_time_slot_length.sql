-- Fix time_slot column length to accommodate time ranges like "08:15-08:45"
ALTER TABLE ai_generated_lessons 
ALTER COLUMN time_slot TYPE VARCHAR(20);

-- Update the unique constraint if needed (it should remain the same)
-- The constraint should already be: provider_id, lesson_date, time_slot