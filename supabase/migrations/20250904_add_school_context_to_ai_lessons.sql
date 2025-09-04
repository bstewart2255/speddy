-- Add school context columns to ai_generated_lessons table
-- This ensures lessons are properly separated by school for providers working at multiple schools

-- First, delete all existing test lessons (as requested by user)
DELETE FROM ai_generated_lessons;

-- Add the school context columns
ALTER TABLE ai_generated_lessons
ADD COLUMN school_id VARCHAR(255),
ADD COLUMN district_id VARCHAR(255),
ADD COLUMN state_id VARCHAR(255);

-- Add foreign key constraints
ALTER TABLE ai_generated_lessons
ADD CONSTRAINT ai_generated_lessons_school_id_fkey 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
ADD CONSTRAINT ai_generated_lessons_district_id_fkey 
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE,
ADD CONSTRAINT ai_generated_lessons_state_id_fkey 
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE;

-- Create composite index for efficient queries
CREATE INDEX idx_ai_lessons_provider_school_date 
  ON ai_generated_lessons(provider_id, school_id, lesson_date);

-- Add unique constraint to prevent duplicate lessons for same provider/school/date/time_slot
ALTER TABLE ai_generated_lessons
DROP CONSTRAINT IF EXISTS ai_generated_lessons_provider_id_lesson_date_time_slot_key;

ALTER TABLE ai_generated_lessons
ADD CONSTRAINT ai_generated_lessons_unique_lesson
  UNIQUE (provider_id, school_id, lesson_date, time_slot);

-- Add comment to explain the columns
COMMENT ON COLUMN ai_generated_lessons.school_id IS 'NCES School ID - identifies which school this lesson belongs to';
COMMENT ON COLUMN ai_generated_lessons.district_id IS 'NCES District ID - identifies which district this lesson belongs to';
COMMENT ON COLUMN ai_generated_lessons.state_id IS 'State code - identifies which state this lesson belongs to';

-- Also add school context to manual_lesson_plans table
ALTER TABLE manual_lesson_plans
ADD COLUMN school_id VARCHAR(255),
ADD COLUMN district_id VARCHAR(255),
ADD COLUMN state_id VARCHAR(255);

-- Add foreign key constraints for manual lessons
ALTER TABLE manual_lesson_plans
ADD CONSTRAINT manual_lesson_plans_school_id_fkey 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
ADD CONSTRAINT manual_lesson_plans_district_id_fkey 
  FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE,
ADD CONSTRAINT manual_lesson_plans_state_id_fkey 
  FOREIGN KEY (state_id) REFERENCES states(id) ON DELETE CASCADE;

-- Create index for efficient queries on manual lessons
CREATE INDEX idx_manual_lessons_provider_school_date 
  ON manual_lesson_plans(provider_id, school_id, lesson_date);

-- Add comments
COMMENT ON COLUMN manual_lesson_plans.school_id IS 'NCES School ID - identifies which school this lesson belongs to';
COMMENT ON COLUMN manual_lesson_plans.district_id IS 'NCES District ID - identifies which district this lesson belongs to';
COMMENT ON COLUMN manual_lesson_plans.state_id IS 'State code - identifies which state this lesson belongs to';