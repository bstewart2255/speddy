-- Instruction schedules: teacher instruction blocks (ELA, Math, etc.)
CREATE TABLE public.instruction_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  teacher_id UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  teacher_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_by_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (start_time < end_time)
);

CREATE INDEX idx_instruction_schedules_school_year ON instruction_schedules(school_id, school_year);
CREATE INDEX idx_instruction_schedules_teacher ON instruction_schedules(teacher_id, day_of_week);

ALTER TABLE instruction_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view instruction schedules at their school" ON instruction_schedules
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = instruction_schedules.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = instruction_schedules.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can insert instruction schedules at their school" ON instruction_schedules
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = instruction_schedules.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = instruction_schedules.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can update instruction schedules at their school" ON instruction_schedules
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = instruction_schedules.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = instruction_schedules.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can delete instruction schedules at their school" ON instruction_schedules
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = instruction_schedules.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = instruction_schedules.school_id
          ))
        )
    )
  );

CREATE TRIGGER update_instruction_schedules_updated_at BEFORE UPDATE ON instruction_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
