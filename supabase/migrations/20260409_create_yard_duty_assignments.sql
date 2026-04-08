-- Yard duty assignments: staff/teacher supervision duty assignments
CREATE TABLE public.yard_duty_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  period_name TEXT NOT NULL,
  zone_name TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  teacher_id UUID REFERENCES teachers(id) ON DELETE CASCADE,
  staff_id UUID REFERENCES staff(id) ON DELETE CASCADE,
  assignee_name TEXT NOT NULL,
  created_by_id UUID NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (start_time < end_time),
  CHECK (teacher_id IS NOT NULL OR staff_id IS NOT NULL)
);

CREATE INDEX idx_yard_duty_school_year ON yard_duty_assignments(school_id, school_year);
CREATE INDEX idx_yard_duty_day ON yard_duty_assignments(school_id, day_of_week);

ALTER TABLE yard_duty_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view yard duty at their school" ON yard_duty_assignments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = yard_duty_assignments.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = yard_duty_assignments.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can insert yard duty at their school" ON yard_duty_assignments
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = yard_duty_assignments.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = yard_duty_assignments.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can update yard duty at their school" ON yard_duty_assignments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = yard_duty_assignments.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = yard_duty_assignments.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can delete yard duty at their school" ON yard_duty_assignments
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = yard_duty_assignments.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = yard_duty_assignments.school_id
          ))
        )
    )
  );

CREATE TRIGGER update_yard_duty_updated_at BEFORE UPDATE ON yard_duty_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
