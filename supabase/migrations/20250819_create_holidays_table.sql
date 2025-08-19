-- Create holidays table with audit trail support
CREATE TABLE IF NOT EXISTS holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  name TEXT,
  school_site TEXT NOT NULL,
  school_district TEXT NOT NULL,
  school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
  district_id TEXT REFERENCES districts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reason TEXT, -- Optional reason for adding/removing holiday
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_holidays_date ON holidays(date);
CREATE INDEX idx_holidays_school_site ON holidays(school_site);
CREATE INDEX idx_holidays_school_district ON holidays(school_district);
CREATE INDEX idx_holidays_school_id ON holidays(school_id);
CREATE INDEX idx_holidays_district_id ON holidays(district_id);
CREATE INDEX idx_holidays_created_by ON holidays(created_by);

-- Unique constraint to prevent duplicate holidays for same date at same location
CREATE UNIQUE INDEX idx_holidays_unique_date_location 
-- Removed: CREATE INDEX idx_holidays_school_site ON holidays(school_site);
-- Removed: CREATE INDEX idx_holidays_school_district ON holidays(school_district);
CREATE INDEX idx_holidays_school_id ON holidays(school_id);
CREATE INDEX idx_holidays_district_id ON holidays(district_id);
CREATE INDEX idx_holidays_created_by ON holidays(created_by);

-- Unique constraint to prevent duplicate holidays for same date at same location (now using IDs)
CREATE UNIQUE INDEX idx_holidays_unique_date_location 
ON holidays(date, school_id, district_id);

-- Add RLS policies
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view holidays for their school/district
CREATE POLICY "Users can view holidays for their school" ON holidays
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (
        (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR
        (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR  
        (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL)
      )
    )
  );

-- Policy: Resource, SEA, and Admin roles can create holidays for their school/district
CREATE POLICY "Eligible roles can create holidays" ON holidays
  FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('resource', 'sea', 'admin')
      AND (
        (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR
        (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR
        (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL)
      )
    )
  );

-- Policy: Resource, SEA, and Admin roles can update holidays for their school/district
CREATE POLICY "Eligible roles can update holidays" ON holidays
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('resource', 'sea', 'admin')
      AND (
        (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR
        (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR
        (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL)
      )
    )
  )
  WITH CHECK (
    updated_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('resource', 'sea', 'admin')
      AND (
        (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR
        (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR
        (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL)
      )
    )
  );

-- Policy: Resource, SEA, and Admin roles can delete holidays for their school/district
-- Only admins can delete past holidays (optional restriction)
CREATE POLICY "Eligible roles can delete holidays" ON holidays
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('resource', 'sea', 'admin')
      AND (
        (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
        OR
        (profiles.school_id = holidays.school_id AND holidays.school_id IS NOT NULL)
        OR
        (profiles.district_id = holidays.district_id AND holidays.district_id IS NOT NULL)
      )
      AND (
        -- Allow all eligible roles to delete future holidays
        date >= CURRENT_DATE
        OR
        -- Only allow admins to delete past holidays
        profiles.role = 'admin'
      )
    )
  );

-- Create function to update updated_at timestamp and set updated_by
CREATE OR REPLACE FUNCTION update_holidays_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at and updated_by
CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW
  EXECUTE FUNCTION update_holidays_updated_at();

-- Create function to automatically set created_by on insert
CREATE OR REPLACE FUNCTION set_holidays_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set created_by
CREATE TRIGGER set_holidays_created_by
  BEFORE INSERT ON holidays
  FOR EACH ROW
-- (set_holidays_created_by trigger and function removed; created_by now uses DEFAULT auth.uid())