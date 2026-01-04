-- Fix CHECK constraints to require both start and end times or neither
-- Previous constraints allowed partial time ranges (only start or only end)
-- which is semantically invalid

-- Drop existing constraints
ALTER TABLE public.activity_type_availability
DROP CONSTRAINT IF EXISTS monday_time_range_valid,
DROP CONSTRAINT IF EXISTS tuesday_time_range_valid,
DROP CONSTRAINT IF EXISTS wednesday_time_range_valid,
DROP CONSTRAINT IF EXISTS thursday_time_range_valid,
DROP CONSTRAINT IF EXISTS friday_time_range_valid;

-- Add new constraints that require both times or neither
ALTER TABLE public.activity_type_availability
ADD CONSTRAINT monday_time_range_valid
  CHECK (
    (monday_start_time IS NULL AND monday_end_time IS NULL) OR
    (monday_start_time IS NOT NULL AND monday_end_time IS NOT NULL AND monday_end_time > monday_start_time)
  ),
ADD CONSTRAINT tuesday_time_range_valid
  CHECK (
    (tuesday_start_time IS NULL AND tuesday_end_time IS NULL) OR
    (tuesday_start_time IS NOT NULL AND tuesday_end_time IS NOT NULL AND tuesday_end_time > tuesday_start_time)
  ),
ADD CONSTRAINT wednesday_time_range_valid
  CHECK (
    (wednesday_start_time IS NULL AND wednesday_end_time IS NULL) OR
    (wednesday_start_time IS NOT NULL AND wednesday_end_time IS NOT NULL AND wednesday_end_time > wednesday_start_time)
  ),
ADD CONSTRAINT thursday_time_range_valid
  CHECK (
    (thursday_start_time IS NULL AND thursday_end_time IS NULL) OR
    (thursday_start_time IS NOT NULL AND thursday_end_time IS NOT NULL AND thursday_end_time > thursday_start_time)
  ),
ADD CONSTRAINT friday_time_range_valid
  CHECK (
    (friday_start_time IS NULL AND friday_end_time IS NULL) OR
    (friday_start_time IS NOT NULL AND friday_end_time IS NOT NULL AND friday_end_time > friday_start_time)
  );
