-- Add SST scheduling fields to care_cases table
-- These fields are used when disposition is 'schedule_sst' to track
-- the scheduled date and link to meeting notes

ALTER TABLE care_cases
ADD COLUMN IF NOT EXISTS sst_scheduled_date date,
ADD COLUMN IF NOT EXISTS sst_notes_link text;

-- Add comment for documentation
COMMENT ON COLUMN care_cases.sst_scheduled_date IS 'Date when SST meeting is scheduled';
COMMENT ON COLUMN care_cases.sst_notes_link IS 'URL link to SST meeting notes document';
