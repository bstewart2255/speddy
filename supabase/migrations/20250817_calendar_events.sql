-- Create calendar_events table for one-off calendar items
CREATE TABLE IF NOT EXISTS calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  all_day BOOLEAN DEFAULT false,
  event_type TEXT CHECK (event_type IN ('meeting', 'assessment', 'activity', 'other')),
  location TEXT,
  attendees TEXT[], -- Array of student IDs or teacher names
  school_id TEXT REFERENCES schools(id) ON DELETE SET NULL,
  district_id TEXT REFERENCES districts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_calendar_events_provider_id ON calendar_events(provider_id);
CREATE INDEX idx_calendar_events_date ON calendar_events(date);
CREATE INDEX idx_calendar_events_provider_date ON calendar_events(provider_id, date);

-- Add RLS policies
ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;

-- Policy: Providers can view their own calendar events
CREATE POLICY "Providers can view own calendar events" ON calendar_events
  FOR SELECT
  USING (auth.uid() = provider_id);

-- Policy: Providers can create their own calendar events
CREATE POLICY "Providers can create own calendar events" ON calendar_events
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- Policy: Providers can update their own calendar events
CREATE POLICY "Providers can update own calendar events" ON calendar_events
  FOR UPDATE
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- Policy: Providers can delete their own calendar events
CREATE POLICY "Providers can delete own calendar events" ON calendar_events
  FOR DELETE
  USING (auth.uid() = provider_id);

-- Policy: SEAs can view calendar events for providers in their school/district
CREATE POLICY "SEAs can view provider calendar events" ON calendar_events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'sea'
      AND (
        (profiles.school_id = calendar_events.school_id AND calendar_events.school_id IS NOT NULL)
        OR
        (profiles.district_id = calendar_events.district_id AND calendar_events.district_id IS NOT NULL)
      )
    )
  );

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_calendar_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_calendar_events_updated_at
  BEFORE UPDATE ON calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION update_calendar_events_updated_at();