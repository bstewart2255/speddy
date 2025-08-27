-- Add trigram indexes for improved fuzzy matching performance
-- These indexes support the find_school_ids_by_names function

-- Ensure pg_trgm extension is enabled (already done in previous migration but safe to repeat)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram indexes for states table
CREATE INDEX IF NOT EXISTS idx_states_name_trgm 
  ON public.states 
  USING gin (LOWER(name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_states_full_name_trgm 
  ON public.states 
  USING gin (LOWER(full_name) gin_trgm_ops);

-- Add trigram indexes for districts table
CREATE INDEX IF NOT EXISTS idx_districts_name_trgm 
  ON public.districts 
  USING gin (LOWER(name) gin_trgm_ops);

-- Add regular index for state_id filtering in districts
CREATE INDEX IF NOT EXISTS idx_districts_state 
  ON public.districts (state_id);

-- Add trigram indexes for schools table
CREATE INDEX IF NOT EXISTS idx_schools_name_trgm 
  ON public.schools 
  USING gin (LOWER(name) gin_trgm_ops);

-- Add regular indexes for state_id and district_id filtering in schools
CREATE INDEX IF NOT EXISTS idx_schools_state 
  ON public.schools (state_id);

CREATE INDEX IF NOT EXISTS idx_schools_district 
  ON public.schools (district_id);

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_schools_state_district 
  ON public.schools (state_id, district_id);

-- Add comment explaining the indexes
COMMENT ON INDEX idx_states_name_trgm IS 'Trigram index for fuzzy matching on state names';
COMMENT ON INDEX idx_states_full_name_trgm IS 'Trigram index for fuzzy matching on state full names';
COMMENT ON INDEX idx_districts_name_trgm IS 'Trigram index for fuzzy matching on district names';
COMMENT ON INDEX idx_schools_name_trgm IS 'Trigram index for fuzzy matching on school names';