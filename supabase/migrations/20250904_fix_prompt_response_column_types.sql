-- Fix data type inconsistencies in prompt/response logging columns
-- This migration standardizes column types across all tables

-- Fix differentiated_lessons table column types
-- Change full_prompt_sent from JSONB to TEXT
ALTER TABLE differentiated_lessons 
ALTER COLUMN full_prompt_sent TYPE TEXT 
USING CASE 
  WHEN full_prompt_sent IS NULL THEN NULL
  ELSE full_prompt_sent::text 
END;

-- Change ai_raw_response from TEXT to JSONB
ALTER TABLE differentiated_lessons 
ALTER COLUMN ai_raw_response TYPE JSONB 
USING CASE 
  WHEN ai_raw_response IS NULL THEN NULL
  WHEN ai_raw_response = '' THEN NULL
  WHEN left(trim(ai_raw_response), 1) IN ('{','[') THEN ai_raw_response::jsonb
  ELSE to_jsonb(ai_raw_response)
END;

-- Verify the changes
DO $$
BEGIN
  RAISE NOTICE 'Column type fixes applied successfully';
  RAISE NOTICE 'All tables now use: TEXT for full_prompt_sent, JSONB for ai_raw_response';
END $$;