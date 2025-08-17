-- Add foreign key constraints to existing calendar_events table
ALTER TABLE calendar_events 
DROP CONSTRAINT IF EXISTS calendar_events_school_id_fkey;

ALTER TABLE calendar_events 
DROP CONSTRAINT IF EXISTS calendar_events_district_id_fkey;

ALTER TABLE calendar_events 
ADD CONSTRAINT calendar_events_school_id_fkey 
FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE calendar_events 
ADD CONSTRAINT calendar_events_district_id_fkey 
FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE SET NULL;