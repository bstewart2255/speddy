-- Staff table: classroom aides, playground supervisors, office staff
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id VARCHAR(20) NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('instructional_assistant', 'supervisor', 'office')),
  program TEXT,
  teacher_id UUID REFERENCES teachers(id) ON DELETE SET NULL,
  room_number TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staff_school_id ON staff(school_id);
CREATE INDEX IF NOT EXISTS idx_staff_name ON staff(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(school_id, role);
CREATE INDEX IF NOT EXISTS idx_staff_teacher_id ON staff(teacher_id);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view staff at their school" ON staff
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = staff.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = staff.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can insert staff at their school" ON staff
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = staff.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = staff.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can update staff at their school" ON staff
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = staff.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = staff.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can delete staff at their school" ON staff
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_permissions ap
      WHERE ap.admin_id = auth.uid()
        AND (
          (ap.role = 'site_admin' AND ap.school_id = staff.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = staff.school_id
          ))
        )
    )
  );

CREATE TRIGGER update_staff_updated_at BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Staff hours table: per-day site time
CREATE TABLE IF NOT EXISTS public.staff_hours (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 5),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(staff_id, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_staff_hours_staff_id ON staff_hours(staff_id);

ALTER TABLE staff_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view staff hours" ON staff_hours
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN admin_permissions ap ON ap.admin_id = auth.uid()
      WHERE s.id = staff_hours.staff_id
        AND (
          (ap.role = 'site_admin' AND ap.school_id = s.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = s.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can insert staff hours" ON staff_hours
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN admin_permissions ap ON ap.admin_id = auth.uid()
      WHERE s.id = staff_hours.staff_id
        AND (
          (ap.role = 'site_admin' AND ap.school_id = s.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = s.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can update staff hours" ON staff_hours
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN admin_permissions ap ON ap.admin_id = auth.uid()
      WHERE s.id = staff_hours.staff_id
        AND (
          (ap.role = 'site_admin' AND ap.school_id = s.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = s.school_id
          ))
        )
    )
  );

CREATE POLICY "Admins can delete staff hours" ON staff_hours
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM staff s
      JOIN admin_permissions ap ON ap.admin_id = auth.uid()
      WHERE s.id = staff_hours.staff_id
        AND (
          (ap.role = 'site_admin' AND ap.school_id = s.school_id)
          OR (ap.role = 'district_admin' AND ap.district_id = (
            SELECT district_id FROM schools WHERE id = s.school_id
          ))
        )
    )
  );

CREATE TRIGGER update_staff_hours_updated_at BEFORE UPDATE ON staff_hours
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
