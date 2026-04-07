-- Track which school years have been activated per school
CREATE TABLE public.activated_school_years (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  school_year TEXT NOT NULL,
  activated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_by UUID NOT NULL REFERENCES auth.users(id),
  UNIQUE (school_id, school_year)
);

-- Index for fast lookups
CREATE INDEX idx_activated_school_years_lookup
  ON public.activated_school_years(school_id, school_year);

-- RLS
ALTER TABLE public.activated_school_years ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site admins can view activated years"
  ON public.activated_school_years
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = activated_school_years.school_id
      AND ap.role = 'site_admin'
    )
  );

CREATE POLICY "Site admins can activate years"
  ON public.activated_school_years
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid()
      AND ap.school_id = activated_school_years.school_id
      AND ap.role = 'site_admin'
    )
  );
