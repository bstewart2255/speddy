-- Add prompt_answered column to track if user responded to lesson completion prompt
-- This enables the curriculum progression feature where users are prompted
-- "Completed Lesson X?" when opening subsequent instances of recurring sessions

ALTER TABLE curriculum_tracking
ADD COLUMN prompt_answered BOOLEAN DEFAULT FALSE NOT NULL;

COMMENT ON COLUMN curriculum_tracking.prompt_answered IS
  'Whether the user has answered the lesson completion prompt for this session instance. TRUE = user clicked Yes or No, FALSE = prompt not yet answered.';
