-- Update the check_sessions_per_week constraint to allow up to 20 sessions per week
-- This aligns with the UI form which allows max 20

-- Drop the old constraint (max 10)
ALTER TABLE students DROP CONSTRAINT IF EXISTS check_sessions_per_week;

-- Add new constraint with max of 20
ALTER TABLE students ADD CONSTRAINT check_sessions_per_week
  CHECK (sessions_per_week > 0 AND sessions_per_week <= 20);
