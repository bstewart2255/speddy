-- Add time range columns to activity_type_availability
-- When times are NULL, it means "all day available"
-- When times are set, it means "available during those hours only"

ALTER TABLE public.activity_type_availability
ADD COLUMN monday_start_time time,
ADD COLUMN monday_end_time time,
ADD COLUMN tuesday_start_time time,
ADD COLUMN tuesday_end_time time,
ADD COLUMN wednesday_start_time time,
ADD COLUMN wednesday_end_time time,
ADD COLUMN thursday_start_time time,
ADD COLUMN thursday_end_time time,
ADD COLUMN friday_start_time time,
ADD COLUMN friday_end_time time;

-- Add check constraints to ensure end time is after start time when both are set
ALTER TABLE public.activity_type_availability
ADD CONSTRAINT monday_time_range_valid
  CHECK (monday_start_time IS NULL OR monday_end_time IS NULL OR monday_end_time > monday_start_time),
ADD CONSTRAINT tuesday_time_range_valid
  CHECK (tuesday_start_time IS NULL OR tuesday_end_time IS NULL OR tuesday_end_time > tuesday_start_time),
ADD CONSTRAINT wednesday_time_range_valid
  CHECK (wednesday_start_time IS NULL OR wednesday_end_time IS NULL OR wednesday_end_time > wednesday_start_time),
ADD CONSTRAINT thursday_time_range_valid
  CHECK (thursday_start_time IS NULL OR thursday_end_time IS NULL OR thursday_end_time > thursday_start_time),
ADD CONSTRAINT friday_time_range_valid
  CHECK (friday_start_time IS NULL OR friday_end_time IS NULL OR friday_end_time > friday_start_time);
