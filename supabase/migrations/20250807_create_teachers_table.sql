-- Create teachers table
CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  classroom_number TEXT,
  phone_number TEXT,
  provider_id UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_teachers_provider_id ON teachers(provider_id);
CREATE INDEX idx_teachers_email ON teachers(email);
CREATE INDEX idx_teachers_name ON teachers(first_name, last_name);

-- Add RLS policies
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- Users can view teachers for their provider
CREATE POLICY "Users can view teachers for their provider" ON teachers
  FOR SELECT USING (provider_id = auth.uid());

-- Users can insert teachers for their provider
CREATE POLICY "Users can insert teachers for their provider" ON teachers
  FOR INSERT WITH CHECK (provider_id = auth.uid());

-- Users can update teachers for their provider
CREATE POLICY "Users can update teachers for their provider" ON teachers
  FOR UPDATE USING (provider_id = auth.uid());

-- Users can delete teachers for their provider
CREATE POLICY "Users can delete teachers for their provider" ON teachers
  FOR DELETE USING (provider_id = auth.uid());

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_teachers_updated_at BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();