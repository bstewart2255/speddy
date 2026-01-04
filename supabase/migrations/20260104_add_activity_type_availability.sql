-- Migration: Add activity type availability table
-- Description: Track which days each activity type is available at each school

-- ============================================================================
-- PART 1: Create activity_type_availability table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.activity_type_availability (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id text NOT NULL,
    activity_type text NOT NULL,
    monday boolean NOT NULL DEFAULT true,
    tuesday boolean NOT NULL DEFAULT true,
    wednesday boolean NOT NULL DEFAULT true,
    thursday boolean NOT NULL DEFAULT true,
    friday boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- Ensure one row per activity type per school
    UNIQUE(school_id, activity_type),

    -- Validate activity type matches known special activity types
    CHECK (activity_type = ANY(ARRAY['Library', 'STEAM', 'STEM', 'Garden', 'Music', 'ART', 'PE']))
);

COMMENT ON TABLE public.activity_type_availability
IS 'Tracks which days each special activity type is available at each school. If no row exists for an activity type, it is considered available all days.';

-- ============================================================================
-- PART 2: Create indexes
-- ============================================================================

CREATE INDEX idx_activity_type_availability_school_id
ON public.activity_type_availability(school_id);

-- ============================================================================
-- PART 3: Enable RLS
-- ============================================================================

ALTER TABLE public.activity_type_availability ENABLE ROW LEVEL SECURITY;

-- Site admins can view availability for their assigned schools
CREATE POLICY "Site admins can view activity availability"
ON public.activity_type_availability FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = activity_type_availability.school_id
    )
);

-- Site admins can insert availability for their assigned schools
CREATE POLICY "Site admins can insert activity availability"
ON public.activity_type_availability FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = activity_type_availability.school_id
    )
);

-- Site admins can update availability for their assigned schools
CREATE POLICY "Site admins can update activity availability"
ON public.activity_type_availability FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = activity_type_availability.school_id
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = activity_type_availability.school_id
    )
);

-- Site admins can delete availability for their assigned schools
CREATE POLICY "Site admins can delete activity availability"
ON public.activity_type_availability FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.admin_permissions ap
        WHERE ap.admin_id = auth.uid()
        AND ap.role = 'site_admin'
        AND ap.school_id = activity_type_availability.school_id
    )
);

-- Resource specialists can view availability for their school (for validation in create modal)
CREATE POLICY "Resource specialists can view activity availability"
ON public.activity_type_availability FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid()
        AND p.school_id = activity_type_availability.school_id
        AND p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist')
    )
);
