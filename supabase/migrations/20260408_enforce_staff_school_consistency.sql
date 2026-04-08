-- Enforce that staff.teacher_id references a teacher at the same school,
-- and staff.provider_id references a provider at the same school.
CREATE OR REPLACE FUNCTION public.verify_staff_school_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Validate teacher belongs to the same school
  IF NEW.teacher_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.teachers
      WHERE id = NEW.teacher_id AND school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Teacher does not belong to this school';
    END IF;
  END IF;

  -- Validate provider is associated with the same school
  IF NEW.provider_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.provider_schools
      WHERE provider_id = NEW.provider_id AND school_id = NEW.school_id
    ) THEN
      RAISE EXCEPTION 'Provider is not associated with this school';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_staff_school_consistency
  BEFORE INSERT OR UPDATE ON public.staff
  FOR EACH ROW
  EXECUTE FUNCTION public.verify_staff_school_consistency();
