-- Fix Critical Security Bug: Self-Referencing RLS Policies
-- Issue: Policies had ap.school_id = ap.school_id (always true)
-- This allowed admins/specialists to manage teachers at ANY school
-- Fix: Properly reference teachers.school_id

-- Drop broken site admin policies
DROP POLICY IF EXISTS "Site admins can create teachers" ON public.teachers;
DROP POLICY IF EXISTS "Site admins can update teachers" ON public.teachers;
DROP POLICY IF EXISTS "Site admins can delete teachers" ON public.teachers;

-- Drop broken resource specialist policy
DROP POLICY IF EXISTS "Resource specialists can create teachers" ON public.teachers;

-- Recreate site admin policies with correct school scoping
CREATE POLICY "Site admins can create teachers"
ON public.teachers FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id  -- Fixed: explicitly reference teachers table
    )
);

CREATE POLICY "Site admins can update teachers"
ON public.teachers FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id  -- Fixed
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id  -- Fixed
    )
);

CREATE POLICY "Site admins can delete teachers"
ON public.teachers FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id  -- Fixed
    )
);

-- Recreate resource specialist policy with correct school scoping
CREATE POLICY "Resource specialists can create teachers"
ON public.teachers FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
        AND p.school_id = teachers.school_id  -- Fixed: explicitly reference teachers table
    )
);

COMMENT ON POLICY "Site admins can create teachers" ON public.teachers
IS 'Site admins can only create teachers at schools they manage';

COMMENT ON POLICY "Site admins can update teachers" ON public.teachers
IS 'Site admins can only update teachers at schools they manage';

COMMENT ON POLICY "Site admins can delete teachers" ON public.teachers
IS 'Site admins can only delete teachers at schools they manage';

COMMENT ON POLICY "Resource specialists can create teachers" ON public.teachers
IS 'Resource specialists can only create teachers at their assigned school';
