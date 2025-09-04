-- Add columns to ai_generated_lessons to store prompts and responses
ALTER TABLE ai_generated_lessons 
ADD COLUMN IF NOT EXISTS full_prompt_sent TEXT,
ADD COLUMN IF NOT EXISTS ai_raw_response JSONB,
ADD COLUMN IF NOT EXISTS model_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Add index on model_used for analytics
CREATE INDEX IF NOT EXISTS idx_ai_generated_lessons_model ON ai_generated_lessons(model_used);

-- Add similar columns to lessons table for the other generation path
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS full_prompt_sent TEXT,
ADD COLUMN IF NOT EXISTS ai_raw_response JSONB,
ADD COLUMN IF NOT EXISTS model_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Add index on model_used for analytics
CREATE INDEX IF NOT EXISTS idx_lessons_model ON lessons(model_used);

-- Add similar columns to differentiated_lessons for the Anthropic path
ALTER TABLE differentiated_lessons 
ADD COLUMN IF NOT EXISTS full_prompt_sent JSONB,  -- JSONB since it has system and user prompts
ADD COLUMN IF NOT EXISTS ai_raw_response TEXT,
ADD COLUMN IF NOT EXISTS model_used VARCHAR(50),
ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER,
ADD COLUMN IF NOT EXISTS completion_tokens INTEGER,
ADD COLUMN IF NOT EXISTS generation_metadata JSONB;

-- Add index on model_used for analytics
CREATE INDEX IF NOT EXISTS idx_differentiated_lessons_model ON differentiated_lessons(model_used);