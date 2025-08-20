-- Add school_id and district_id columns to existing holidays table
ALTER TABLE holidays 
ADD COLUMN IF NOT EXISTS school_id TEXT,
ADD COLUMN IF NOT EXISTS district_id TEXT;

-- Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_holidays_school_id ON holidays(school_id);
CREATE INDEX IF NOT EXISTS idx_holidays_district_id ON holidays(district_id);

-- Add unique constraint for the new columns
DROP INDEX IF EXISTS idx_holidays_unique_date_location;
CREATE UNIQUE INDEX idx_holidays_unique_date_location ON holidays(date, school_id, district_id);

-- The RLS policies from the original migration can be added/updated here if needed
-- But first check if they already exist to avoid conflicts