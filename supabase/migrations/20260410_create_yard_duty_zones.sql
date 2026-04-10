-- Simple zone list per school for yard duty assignments
CREATE TABLE IF NOT EXISTS public.yard_duty_zones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id text NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
    zone_name text NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(school_id, zone_name)
);

CREATE INDEX IF NOT EXISTS idx_yard_duty_zones_school_id ON public.yard_duty_zones(school_id);

ALTER TABLE public.yard_duty_zones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Site admins can view zones"
    ON public.yard_duty_zones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = auth.uid()
            AND ap.school_id = yard_duty_zones.school_id
            AND ap.role IN ('site_admin', 'specialist')
        )
        OR
        EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = auth.uid()
            AND ap.role = 'district_admin'
        )
    );

CREATE POLICY "Site admins can insert zones"
    ON public.yard_duty_zones FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = auth.uid()
            AND ap.school_id = yard_duty_zones.school_id
            AND ap.role = 'site_admin'
        )
    );

CREATE POLICY "Site admins can delete zones"
    ON public.yard_duty_zones FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = auth.uid()
            AND ap.school_id = yard_duty_zones.school_id
            AND ap.role = 'site_admin'
        )
    );
