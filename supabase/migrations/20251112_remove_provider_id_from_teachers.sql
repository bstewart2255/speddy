-- Remove provider_id from Teachers Table
-- Decision: Teachers are managed at school level by admins, not by individual specialists
-- provider_id concept remains for students, sessions, IEPs, etc.

-- Step 1: Drop all policies that depend on teachers.provider_id column

-- Drop policies on teachers table that reference provider_id
DROP POLICY IF EXISTS "Resource specialists can manage teachers" ON public.teachers;
DROP POLICY IF EXISTS "Teachers can update own record" ON public.teachers;
DROP POLICY IF EXISTS "Teachers can view own record" ON public.teachers;
DROP POLICY IF EXISTS "School-level teacher visibility" ON public.teachers;

-- Drop policies on other tables that reference teachers.provider_id
DROP POLICY IF EXISTS "Teachers can view own and RS activities" ON public.special_activities;

-- Step 2: Drop the provider_id column from teachers table
-- Note: This does NOT delete teacher records, only removes the column
ALTER TABLE public.teachers
DROP COLUMN IF EXISTS provider_id;

-- Step 3: Recreate "School-level teacher visibility" policy WITHOUT provider_id
CREATE POLICY "School-level teacher visibility"
ON public.teachers FOR SELECT
TO authenticated
USING (
    -- Teachers can see their own record via account_id
    account_id = auth.uid()
    -- Resource specialists can see teachers at their school
    OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.school_id = teachers.school_id
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
    )
    -- Site admins can see teachers at their assigned schools
    OR EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id
    )
    -- District admins can see teachers in their district (future feature)
    OR EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        JOIN public.profiles p ON p.id = teachers.account_id
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'district_admin'
        AND ap.district_id = p.district_id
    )
);

-- Step 4: Recreate "Teachers can view own and RS activities" policy WITHOUT teachers.provider_id
CREATE POLICY "Teachers can view own and RS activities"
ON public.special_activities FOR SELECT
TO authenticated
USING (
    -- Teachers can see activities they created
    (created_by_id = auth.uid() AND created_by_role = 'teacher')
    -- Teachers can see resource specialist activities at their school
    OR (
        created_by_role = 'resource'
        AND school_id IN (
            SELECT t.school_id
            FROM public.teachers t
            WHERE t.account_id = auth.uid()
        )
    )
);

-- Add comment to document the change
COMMENT ON TABLE public.teachers
IS 'Teacher records managed at school level. Teachers can be created by site admins and self-manage via account_id. provider_id was removed as teachers are not specialist-owned resources.';

COMMENT ON POLICY "School-level teacher visibility" ON public.teachers
IS 'Teachers visible at school level: by account_id (self), specialists at same school, site admins, and district admins';

COMMENT ON POLICY "Teachers can view own and RS activities" ON public.special_activities
IS 'Teachers can view their own activities and resource specialist activities at their school';
