-- Add admin roles and restructure for school-scoped teacher management
-- This migration enables:
-- 1. Site Admin and District Admin roles
-- 2. Linking teacher records to user accounts (teacher portal)
-- 3. School-level teacher sharing (not provider-scoped)

-- ============================================================================
-- PART 1: Add admin roles to profiles
-- ============================================================================

-- Drop and recreate the role check constraint to include admin roles
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role = ANY (ARRAY[
    'resource'::text,
    'speech'::text,
    'ot'::text,
    'counseling'::text,
    'specialist'::text,
    'sea'::text,
    'teacher'::text,
    'site_admin'::text,
    'district_admin'::text
]));

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles
IS 'Allowed roles: resource specialist roles (resource, speech, ot, counseling, specialist), SEA, teacher, site_admin, district_admin';

-- ============================================================================
-- PART 2: Add account linking to teachers table
-- ============================================================================

-- Add column to link teacher records to their user account (if they have one)
ALTER TABLE public.teachers
ADD COLUMN IF NOT EXISTS account_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_teachers_account_id
ON public.teachers(account_id)
WHERE account_id IS NOT NULL;

-- Add column to track if teacher was created by admin (vs auto-created by RSP)
ALTER TABLE public.teachers
ADD COLUMN IF NOT EXISTS created_by_admin boolean DEFAULT false;

COMMENT ON COLUMN public.teachers.account_id
IS 'Links to profiles.id if this teacher has a user account (for teacher portal access)';

COMMENT ON COLUMN public.teachers.created_by_admin
IS 'True if created by site/district admin, false if auto-created by resource specialist from student form';

-- ============================================================================
-- PART 3: Add index for school-scoped queries
-- ============================================================================

-- Add index on school_id for efficient school-level teacher directory queries
CREATE INDEX IF NOT EXISTS idx_teachers_school_id
ON public.teachers(school_id)
WHERE school_id IS NOT NULL;

-- Add composite index for common query pattern: school + active status
CREATE INDEX IF NOT EXISTS idx_teachers_school_active
ON public.teachers(school_id, updated_at DESC)
WHERE school_id IS NOT NULL;

-- ============================================================================
-- PART 4: Create admin_permissions table
-- ============================================================================

-- Track which schools/districts each admin manages
CREATE TABLE IF NOT EXISTS public.admin_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

    -- Admin role type
    role text NOT NULL CHECK (role IN ('site_admin', 'district_admin')),

    -- School/district assignment (NCES IDs)
    school_id text,      -- Specific school (for site_admin)
    district_id text,    -- District (for district_admin or site_admin's district)
    state_id text,       -- 2-letter state code

    -- Audit fields
    granted_at timestamptz DEFAULT now(),
    granted_by uuid REFERENCES public.profiles(id),  -- Who gave them this permission

    -- Constraints
    UNIQUE(admin_id, school_id, district_id),  -- Prevent duplicate permissions
    CHECK (
        -- Site admin must have school_id
        (role = 'site_admin' AND school_id IS NOT NULL) OR
        -- District admin must have district_id
        (role = 'district_admin' AND district_id IS NOT NULL)
    )
);

-- Indexes for efficient lookups
CREATE INDEX idx_admin_permissions_admin_id ON public.admin_permissions(admin_id);
CREATE INDEX idx_admin_permissions_school_id ON public.admin_permissions(school_id) WHERE school_id IS NOT NULL;
CREATE INDEX idx_admin_permissions_district_id ON public.admin_permissions(district_id) WHERE district_id IS NOT NULL;

COMMENT ON TABLE public.admin_permissions
IS 'Tracks which schools/districts each site_admin and district_admin can manage';

-- ============================================================================
-- PART 5: Enable RLS on admin_permissions
-- ============================================================================

ALTER TABLE public.admin_permissions ENABLE ROW LEVEL SECURITY;

-- Admins can view their own permissions
CREATE POLICY "Admins can view their own permissions"
ON public.admin_permissions FOR SELECT
TO authenticated
USING (admin_id = auth.uid());

-- Only super admins (to be implemented) can modify permissions
-- For now, this will be done via SQL by developers
CREATE POLICY "Only super admins can manage permissions"
ON public.admin_permissions FOR ALL
TO authenticated
USING (false)  -- Will update this when we implement super admin role
WITH CHECK (false);

-- ============================================================================
-- PART 6: Update teachers RLS policies for school-level access
-- ============================================================================

-- Drop old provider-scoped policies
DROP POLICY IF EXISTS "Resource specialists can view their own teachers" ON public.teachers;
DROP POLICY IF EXISTS "Resource specialists can create teachers" ON public.teachers;
DROP POLICY IF EXISTS "Resource specialists can update their own teachers" ON public.teachers;
DROP POLICY IF EXISTS "Resource specialists can delete their own teachers" ON public.teachers;

-- NEW: School-scoped view policy
-- Teachers are viewable by:
-- 1. Resource specialists at the same school
-- 2. Site admins for that school
-- 3. District admins for that district
-- 4. The teacher themselves (if they have an account)
CREATE POLICY "School-level teacher visibility"
ON public.teachers FOR SELECT
TO authenticated
USING (
    -- Teachers can view their own record
    account_id = auth.uid()
    OR
    -- Resource specialists at same school can view
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.school_id = teachers.school_id
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
    )
    OR
    -- Site admins for this school can view
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = teachers.school_id
    )
    OR
    -- District admins for this district can view
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        INNER JOIN public.profiles p ON p.id = auth.uid()
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'district_admin'
        AND ap.district_id = p.district_id
    )
);

-- NEW: Teachers can update their own contact info
CREATE POLICY "Teachers can update their own contact info"
ON public.teachers FOR UPDATE
TO authenticated
USING (account_id = auth.uid())
WITH CHECK (account_id = auth.uid());

-- NEW: Resource specialists can create teachers at their school
CREATE POLICY "Resource specialists can create teachers"
ON public.teachers FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
        -- Can only create teachers at their own school
        AND (p.school_id = school_id OR school_id IS NULL)
    )
);

-- NEW: Admins can create teachers at their assigned schools
CREATE POLICY "Admins can create teachers"
ON public.teachers FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND (
            -- Site admins for this school
            (ap.role = 'site_admin' AND ap.school_id = school_id)
            OR
            -- District admins for this district
            (ap.role = 'district_admin' AND EXISTS (
                SELECT 1 FROM public.schools s
                WHERE s.school_id = teachers.school_id
                AND s.district_id = ap.district_id
            ))
        )
    )
);

-- NEW: Admins can update teachers at their schools
CREATE POLICY "Admins can update teachers"
ON public.teachers FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND (
            -- Site admins for this school
            (ap.role = 'site_admin' AND ap.school_id = school_id)
            OR
            -- District admins for this district
            (ap.role = 'district_admin' AND EXISTS (
                SELECT 1 FROM public.schools s
                WHERE s.school_id = teachers.school_id
                AND s.district_id = ap.district_id
            ))
        )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND (
            (ap.role = 'site_admin' AND ap.school_id = school_id)
            OR
            (ap.role = 'district_admin' AND EXISTS (
                SELECT 1 FROM public.schools s
                WHERE s.school_id = teachers.school_id
                AND s.district_id = ap.district_id
            ))
        )
    )
);

-- NEW: Admins can delete teachers at their schools
CREATE POLICY "Admins can delete teachers"
ON public.teachers FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND (
            (ap.role = 'site_admin' AND ap.school_id = school_id)
            OR
            (ap.role = 'district_admin' AND EXISTS (
                SELECT 1 FROM public.schools s
                WHERE s.school_id = teachers.school_id
                AND s.district_id = ap.district_id
            ))
        )
    )
);

COMMENT ON POLICY "School-level teacher visibility" ON public.teachers
IS 'Teachers visible to all staff at same school (resource specialists, admins, and the teacher themselves)';
