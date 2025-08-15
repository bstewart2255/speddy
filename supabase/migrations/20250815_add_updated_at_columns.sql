-- Add updated_at column to bell_schedules table
ALTER TABLE bell_schedules 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Add updated_at column to special_activities table
ALTER TABLE special_activities 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create trigger function to automatically update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for bell_schedules
DROP TRIGGER IF EXISTS update_bell_schedules_updated_at ON bell_schedules;
CREATE TRIGGER update_bell_schedules_updated_at
    BEFORE UPDATE ON bell_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for special_activities
DROP TRIGGER IF EXISTS update_special_activities_updated_at ON special_activities;
CREATE TRIGGER update_special_activities_updated_at
    BEFORE UPDATE ON special_activities
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for school_hours (in case it doesn't exist)
DROP TRIGGER IF EXISTS update_school_hours_updated_at ON school_hours;
CREATE TRIGGER update_school_hours_updated_at
    BEFORE UPDATE ON school_hours
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Update existing records to set updated_at to created_at where updated_at is NULL
UPDATE bell_schedules 
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE special_activities 
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;

UPDATE school_hours 
SET updated_at = COALESCE(updated_at, created_at, NOW())
WHERE updated_at IS NULL;