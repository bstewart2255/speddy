-- Create junction table for many-to-many staff <-> teacher/provider assignments
CREATE TABLE IF NOT EXISTS public.staff_teacher_assignments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- Exactly one of teacher_id or provider_id must be set
  CONSTRAINT staff_assignment_teacher_or_provider CHECK (
    (teacher_id IS NOT NULL AND provider_id IS NULL) OR
    (teacher_id IS NULL AND provider_id IS NOT NULL)
  ),
  -- Prevent duplicate assignments
  CONSTRAINT staff_teacher_unique UNIQUE (staff_id, teacher_id),
  CONSTRAINT staff_provider_unique UNIQUE (staff_id, provider_id)
);

-- RLS
ALTER TABLE public.staff_teacher_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage staff assignments"
  ON public.staff_teacher_assignments
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      JOIN public.admin_permissions ap ON ap.school_id = s.school_id
      WHERE s.id = staff_teacher_assignments.staff_id
        AND ap.admin_id = auth.uid()
        AND ap.role IN ('site_admin', 'district_admin')
    )
  );

-- Indexes
CREATE INDEX idx_staff_teacher_assignments_staff_id ON public.staff_teacher_assignments(staff_id);
CREATE INDEX idx_staff_teacher_assignments_teacher_id ON public.staff_teacher_assignments(teacher_id) WHERE teacher_id IS NOT NULL;
CREATE INDEX idx_staff_teacher_assignments_provider_id ON public.staff_teacher_assignments(provider_id) WHERE provider_id IS NOT NULL;

-- Migrate existing data from staff.teacher_id and staff.provider_id
INSERT INTO public.staff_teacher_assignments (staff_id, teacher_id)
SELECT id, teacher_id FROM public.staff WHERE teacher_id IS NOT NULL;

INSERT INTO public.staff_teacher_assignments (staff_id, provider_id)
SELECT id, provider_id FROM public.staff WHERE provider_id IS NOT NULL;

-- Drop old columns and constraints
DROP TRIGGER IF EXISTS trg_staff_school_consistency ON public.staff;
ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_teacher_or_provider_check;
ALTER TABLE public.staff DROP COLUMN IF EXISTS teacher_id;
ALTER TABLE public.staff DROP COLUMN IF EXISTS provider_id;

-- Recreate trigger to validate assignments via the junction table
CREATE OR REPLACE FUNCTION public.verify_staff_assignment_school_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_school_id TEXT;
BEGIN
  -- Get the staff member's school
  SELECT school_id INTO v_school_id FROM public.staff WHERE id = NEW.staff_id;

  IF NEW.teacher_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.teachers WHERE id = NEW.teacher_id AND school_id = v_school_id
    ) THEN
      RAISE EXCEPTION 'Teacher does not belong to this school';
    END IF;
  END IF;

  IF NEW.provider_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.provider_schools WHERE provider_id = NEW.provider_id AND school_id = v_school_id
    ) THEN
      RAISE EXCEPTION 'Provider is not associated with this school';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_staff_assignment_school_consistency
  BEFORE INSERT OR UPDATE ON public.staff_teacher_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.verify_staff_assignment_school_consistency();
