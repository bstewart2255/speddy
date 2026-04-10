-- Add provider_id column to yard_duty_assignments so providers can be assigned yard duty
ALTER TABLE yard_duty_assignments
  ADD COLUMN provider_id uuid REFERENCES profiles(id) ON DELETE CASCADE;

-- Replace the XOR constraint to allow exactly one of teacher_id, staff_id, or provider_id
ALTER TABLE yard_duty_assignments
  DROP CONSTRAINT yard_duty_assignments_single_assignee;

ALTER TABLE yard_duty_assignments
  ADD CONSTRAINT yard_duty_assignments_single_assignee CHECK (
    (teacher_id IS NOT NULL AND staff_id IS NULL AND provider_id IS NULL)
    OR (teacher_id IS NULL AND staff_id IS NOT NULL AND provider_id IS NULL)
    OR (teacher_id IS NULL AND staff_id IS NULL AND provider_id IS NOT NULL)
  );
