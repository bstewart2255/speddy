-- Enable RLS if not already enabled
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view holidays for their school" ON holidays;
DROP POLICY IF EXISTS "Eligible roles can create holidays" ON holidays;
DROP POLICY IF EXISTS "Eligible roles can update holidays" ON holidays;
DROP POLICY IF EXISTS "Eligible roles can delete holidays" ON holidays;

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

-- Create function to update updated_at timestamp and set updated_by (if not exists)
CREATE OR REPLACE FUNCTION update_holidays_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.updated_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at and updated_by (if not exists)
DROP TRIGGER IF EXISTS update_holidays_updated_at ON holidays;
CREATE TRIGGER update_holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW
  EXECUTE FUNCTION update_holidays_updated_at();

-- Create function to automatically set created_by on insert (if not exists)
CREATE OR REPLACE FUNCTION set_holidays_created_by()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_by = auth.uid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set created_by (if not exists)
DROP TRIGGER IF EXISTS set_holidays_created_by ON holidays;
CREATE TRIGGER set_holidays_created_by
  BEFORE INSERT ON holidays
  FOR EACH ROW
  EXECUTE FUNCTION set_holidays_created_by();