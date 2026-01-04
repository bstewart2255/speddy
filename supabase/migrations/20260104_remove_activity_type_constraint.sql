-- Remove the CHECK constraint that limits activity types to a predefined list
-- This allows schools to define their own custom activity types

ALTER TABLE public.activity_type_availability
DROP CONSTRAINT activity_type_availability_activity_type_check;
