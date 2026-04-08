-- Add provider_id column to staff table so staff can be assigned to a provider
ALTER TABLE public.staff
  ADD COLUMN provider_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for provider_id lookups
CREATE INDEX idx_staff_provider_id ON public.staff(provider_id) WHERE provider_id IS NOT NULL;

-- Ensure staff is assigned to at most one of teacher or provider
ALTER TABLE public.staff
  ADD CONSTRAINT staff_teacher_or_provider_check
  CHECK (NOT (teacher_id IS NOT NULL AND provider_id IS NOT NULL));
