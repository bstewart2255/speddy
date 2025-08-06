-- Create states table
CREATE TABLE IF NOT EXISTS states (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create districts table with NCES fields
CREATE TABLE IF NOT EXISTS districts (
  id TEXT PRIMARY KEY, -- NCES LEA ID
  state_id TEXT NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nces_id TEXT UNIQUE, -- NCES LEA ID (redundant but for clarity)
  city TEXT,
  zip_code TEXT,
  county TEXT,
  phone TEXT,
  website TEXT,
  superintendent_name TEXT,
  enrollment_total INTEGER,
  schools_count INTEGER DEFAULT 0,
  grade_span_low TEXT,
  grade_span_high TEXT,
  urban_centric_locale TEXT, -- Urban, Suburban, Rural, etc.
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_district_per_state UNIQUE(state_id, name)
);

-- Create schools table with NCES fields
CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY, -- NCES School ID
  district_id TEXT NOT NULL REFERENCES districts(id) ON DELETE CASCADE,
  state_id TEXT NOT NULL REFERENCES states(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  nces_id TEXT UNIQUE, -- NCES School ID (redundant but for clarity)
  school_type TEXT, -- Elementary, Middle, High, etc.
  grade_span_low TEXT,
  grade_span_high TEXT,
  street_address TEXT,
  city TEXT,
  zip_code TEXT,
  phone TEXT,
  website TEXT,
  principal_name TEXT,
  enrollment_total INTEGER,
  teachers_fte DECIMAL(10,2),
  student_teacher_ratio DECIMAL(5,2),
  free_reduced_lunch_eligible INTEGER,
  charter_school BOOLEAN DEFAULT false,
  magnet_school BOOLEAN DEFAULT false,
  title_i_school BOOLEAN DEFAULT false,
  urban_centric_locale TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_school_per_district UNIQUE(district_id, name)
);

-- Create indexes for better performance
CREATE INDEX idx_districts_state_id ON districts(state_id);
CREATE INDEX idx_districts_name ON districts(name);
CREATE INDEX idx_districts_nces_id ON districts(nces_id);
CREATE INDEX idx_districts_is_active ON districts(is_active);

CREATE INDEX idx_schools_district_id ON schools(district_id);
CREATE INDEX idx_schools_state_id ON schools(state_id);
CREATE INDEX idx_schools_name ON schools(name);
CREATE INDEX idx_schools_nces_id ON schools(nces_id);
CREATE INDEX idx_schools_is_active ON schools(is_active);
CREATE INDEX idx_schools_school_type ON schools(school_type);

-- Add full-text search indexes for autocomplete
CREATE INDEX idx_districts_name_search ON districts USING gin(to_tsvector('english', name));
CREATE INDEX idx_schools_name_search ON schools USING gin(to_tsvector('english', name));

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers to update updated_at
CREATE TRIGGER update_states_updated_at BEFORE UPDATE ON states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_districts_updated_at BEFORE UPDATE ON districts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_schools_updated_at BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security
ALTER TABLE states ENABLE ROW LEVEL SECURITY;
ALTER TABLE districts ENABLE ROW LEVEL SECURITY;
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (read-only for authenticated users)
CREATE POLICY "Allow authenticated users to read states" ON states
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read districts" ON districts
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to read schools" ON schools
  FOR SELECT USING (auth.role() = 'authenticated');

-- Insert all US states and territories
INSERT INTO states (id, name, abbreviation) VALUES
  ('AL', 'Alabama', 'AL'),
  ('AK', 'Alaska', 'AK'),
  ('AZ', 'Arizona', 'AZ'),
  ('AR', 'Arkansas', 'AR'),
  ('CA', 'California', 'CA'),
  ('CO', 'Colorado', 'CO'),
  ('CT', 'Connecticut', 'CT'),
  ('DE', 'Delaware', 'DE'),
  ('DC', 'District of Columbia', 'DC'),
  ('FL', 'Florida', 'FL'),
  ('GA', 'Georgia', 'GA'),
  ('HI', 'Hawaii', 'HI'),
  ('ID', 'Idaho', 'ID'),
  ('IL', 'Illinois', 'IL'),
  ('IN', 'Indiana', 'IN'),
  ('IA', 'Iowa', 'IA'),
  ('KS', 'Kansas', 'KS'),
  ('KY', 'Kentucky', 'KY'),
  ('LA', 'Louisiana', 'LA'),
  ('ME', 'Maine', 'ME'),
  ('MD', 'Maryland', 'MD'),
  ('MA', 'Massachusetts', 'MA'),
  ('MI', 'Michigan', 'MI'),
  ('MN', 'Minnesota', 'MN'),
  ('MS', 'Mississippi', 'MS'),
  ('MO', 'Missouri', 'MO'),
  ('MT', 'Montana', 'MT'),
  ('NE', 'Nebraska', 'NE'),
  ('NV', 'Nevada', 'NV'),
  ('NH', 'New Hampshire', 'NH'),
  ('NJ', 'New Jersey', 'NJ'),
  ('NM', 'New Mexico', 'NM'),
  ('NY', 'New York', 'NY'),
  ('NC', 'North Carolina', 'NC'),
  ('ND', 'North Dakota', 'ND'),
  ('OH', 'Ohio', 'OH'),
  ('OK', 'Oklahoma', 'OK'),
  ('OR', 'Oregon', 'OR'),
  ('PA', 'Pennsylvania', 'PA'),
  ('PR', 'Puerto Rico', 'PR'),
  ('RI', 'Rhode Island', 'RI'),
  ('SC', 'South Carolina', 'SC'),
  ('SD', 'South Dakota', 'SD'),
  ('TN', 'Tennessee', 'TN'),
  ('TX', 'Texas', 'TX'),
  ('UT', 'Utah', 'UT'),
  ('VT', 'Vermont', 'VT'),
  ('VA', 'Virginia', 'VA'),
  ('VI', 'Virgin Islands', 'VI'),
  ('WA', 'Washington', 'WA'),
  ('WV', 'West Virginia', 'WV'),
  ('WI', 'Wisconsin', 'WI'),
  ('WY', 'Wyoming', 'WY'),
  ('AS', 'American Samoa', 'AS'),
  ('GU', 'Guam', 'GU'),
  ('MP', 'Northern Mariana Islands', 'MP')
ON CONFLICT (id) DO NOTHING;

-- Add migration tables to track import progress
CREATE TABLE IF NOT EXISTS nces_import_progress (
  id SERIAL PRIMARY KEY,
  import_type TEXT NOT NULL, -- 'districts' or 'schools'
  state_id TEXT REFERENCES states(id),
  last_processed_id TEXT,
  total_records INTEGER DEFAULT 0,
  processed_records INTEGER DEFAULT 0,
  failed_records INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, in_progress, completed, failed
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nces_import_errors (
  id SERIAL PRIMARY KEY,
  import_progress_id INTEGER REFERENCES nces_import_progress(id),
  record_id TEXT,
  record_type TEXT, -- 'district' or 'school'
  error_message TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for import tracking
CREATE INDEX idx_import_progress_status ON nces_import_progress(status);
CREATE INDEX idx_import_progress_state ON nces_import_progress(state_id);
CREATE INDEX idx_import_errors_progress ON nces_import_errors(import_progress_id);

-- Add updated_at trigger for import progress
CREATE TRIGGER update_import_progress_updated_at BEFORE UPDATE ON nces_import_progress
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE states IS 'US states and territories';
COMMENT ON TABLE districts IS 'School districts with NCES data';
COMMENT ON TABLE schools IS 'Individual schools with NCES data';
COMMENT ON TABLE nces_import_progress IS 'Tracks progress of NCES data imports';
COMMENT ON TABLE nces_import_errors IS 'Logs errors during NCES data import';