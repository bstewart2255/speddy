-- Fix: Change ON DELETE SET NULL to ON DELETE CASCADE for yard duty assignee FKs.
-- SET NULL would violate CHECK (teacher_id IS NOT NULL OR staff_id IS NOT NULL)
-- when the referenced teacher/staff is deleted.

ALTER TABLE yard_duty_assignments
  DROP CONSTRAINT yard_duty_assignments_teacher_id_fkey,
  ADD CONSTRAINT yard_duty_assignments_teacher_id_fkey
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE;

ALTER TABLE yard_duty_assignments
  DROP CONSTRAINT yard_duty_assignments_staff_id_fkey,
  ADD CONSTRAINT yard_duty_assignments_staff_id_fkey
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE;
