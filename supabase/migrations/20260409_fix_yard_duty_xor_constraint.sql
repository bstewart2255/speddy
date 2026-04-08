-- Fix: Tighten assignee check to XOR — exactly one of teacher_id or staff_id must be set.
-- Prevents ambiguous rows with both assignees set.

ALTER TABLE yard_duty_assignments
  DROP CONSTRAINT yard_duty_assignments_check1,
  ADD CONSTRAINT yard_duty_assignments_single_assignee CHECK (
    (teacher_id IS NOT NULL AND staff_id IS NULL)
    OR (teacher_id IS NULL AND staff_id IS NOT NULL)
  );
