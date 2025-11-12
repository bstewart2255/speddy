-- Fix user_accessible_school_ids() to support admin roles during authentication
-- Issue: Admin roles (site_admin, district_admin) were failing to authenticate because
-- the user_accessible_school_ids() function only checked profiles and provider_schools,
-- not admin_permissions. This caused "Database error querying schema" during login.

CREATE OR REPLACE FUNCTION public.user_accessible_school_ids()
RETURNS TABLE(school_id character varying)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT DISTINCT school_id FROM (
        -- User's primary school from profiles
        SELECT p.school_id
        FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.school_id IS NOT NULL

        UNION

        -- Additional schools from provider_schools (for multi-school specialists)
        SELECT ps.school_id
        FROM public.provider_schools ps
        WHERE ps.provider_id = auth.uid()
        AND ps.school_id IS NOT NULL

        UNION

        -- Schools from admin_permissions (for site_admin and district_admin)
        SELECT ap.school_id
        FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.school_id IS NOT NULL
    ) schools
    WHERE school_id IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.user_accessible_school_ids()
IS 'Returns all school IDs accessible to the current user: primary school from profiles, additional schools for multi-school specialists from provider_schools, and admin-managed schools from admin_permissions';
