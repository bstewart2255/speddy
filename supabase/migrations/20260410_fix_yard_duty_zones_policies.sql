-- Fix yard_duty_zones RLS policies:
-- 1. Remove invalid 'specialist' role from SELECT policy
-- 2. Scope district admin SELECT to their district

DROP POLICY IF EXISTS "Site admins can view zones" ON public.yard_duty_zones;

CREATE POLICY "Site admins can view zones"
    ON public.yard_duty_zones FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            WHERE ap.admin_id = auth.uid()
            AND ap.school_id = yard_duty_zones.school_id
            AND ap.role = 'site_admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM public.admin_permissions ap
            JOIN public.schools s ON s.id = yard_duty_zones.school_id
            WHERE ap.admin_id = auth.uid()
            AND ap.role = 'district_admin'
            AND ap.district_id = s.district_id
        )
    );
