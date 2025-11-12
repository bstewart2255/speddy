-- Migrate special_activities from teacher_name (text) to teacher_id (uuid)
-- This enables referential integrity and allows teachers to be linked to their accounts

-- ============================================================================
-- PART 1: Add teacher_id column
-- ============================================================================

-- Add new column to reference teachers table
ALTER TABLE public.special_activities
ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.teachers(id) ON DELETE SET NULL;

-- Add index for efficient queries
CREATE INDEX IF NOT EXISTS idx_special_activities_teacher_id
ON public.special_activities(teacher_id)
WHERE teacher_id IS NOT NULL;

-- Add composite index for common query: school + teacher
CREATE INDEX IF NOT EXISTS idx_special_activities_school_teacher
ON public.special_activities(school_id, teacher_id)
WHERE teacher_id IS NOT NULL;

COMMENT ON COLUMN public.special_activities.teacher_id
IS 'References teachers.id - replaces text-based teacher_name field';

-- ============================================================================
-- PART 2: Migrate existing data (best-effort matching)
-- ============================================================================

-- This attempts to match text names to teacher records at the same school
-- Matching logic:
-- 1. Split teacher_name into first/last name (last word = last name)
-- 2. Find teacher with matching name at same school_id
-- 3. If multiple matches, use the most recently updated one

DO $$
DECLARE
    activity_record RECORD;
    matched_teacher_id uuid;
    first_name_part text;
    last_name_part text;
    name_parts text[];
BEGIN
    -- Loop through all special activities that have a teacher_name but no teacher_id
    FOR activity_record IN
        SELECT id, teacher_name, school_id, school_site
        FROM public.special_activities
        WHERE teacher_name IS NOT NULL
        AND teacher_id IS NULL
    LOOP
        -- Split name into parts (same logic as getOrCreateTeacher)
        name_parts := string_to_array(trim(activity_record.teacher_name), ' ');

        IF array_length(name_parts, 1) = 1 THEN
            -- Single name - treat as last name
            first_name_part := '';
            last_name_part := name_parts[1];
        ELSE
            -- Multiple parts - last part is last name, rest is first name
            last_name_part := name_parts[array_length(name_parts, 1)];
            first_name_part := array_to_string(name_parts[1:array_length(name_parts, 1)-1], ' ');
        END IF;

        -- Try to find matching teacher at same school
        SELECT t.id INTO matched_teacher_id
        FROM public.teachers t
        WHERE t.school_id = activity_record.school_id
        AND (
            -- Match on last name only (if single name)
            (first_name_part = '' AND LOWER(t.last_name) = LOWER(last_name_part))
            OR
            -- Match on first + last name
            (
                LOWER(t.first_name) = LOWER(first_name_part)
                AND LOWER(t.last_name) = LOWER(last_name_part)
            )
            OR
            -- Fuzzy match: last name matches and first name starts with same letter
            (
                LOWER(t.last_name) = LOWER(last_name_part)
                AND LEFT(LOWER(t.first_name), 1) = LEFT(LOWER(first_name_part), 1)
            )
        )
        ORDER BY t.updated_at DESC  -- Use most recent if multiple matches
        LIMIT 1;

        -- If we found a match, update the activity
        IF matched_teacher_id IS NOT NULL THEN
            UPDATE public.special_activities
            SET teacher_id = matched_teacher_id
            WHERE id = activity_record.id;

            RAISE NOTICE 'Matched activity % teacher "%" to teacher ID %',
                activity_record.id, activity_record.teacher_name, matched_teacher_id;
        ELSE
            RAISE NOTICE 'Could not match activity % teacher "%" at school %',
                activity_record.id, activity_record.teacher_name, activity_record.school_id;
        END IF;
    END LOOP;
END $$;

-- ============================================================================
-- PART 3: Add constraint (optional - commented out for now)
-- ============================================================================

-- Once all activities are migrated and UI is updated, we can enforce that
-- either teacher_id or teacher_name must be present (not both null)

-- Uncomment this after migration is complete and tested:
/*
ALTER TABLE public.special_activities
ADD CONSTRAINT special_activities_teacher_check
CHECK (teacher_id IS NOT NULL OR teacher_name IS NOT NULL);
*/

-- ============================================================================
-- PART 4: Create helper function for getting teacher name
-- ============================================================================

-- This function returns the teacher's display name, falling back to text field
-- if teacher_id is not set. Useful for displaying activities during migration period.

CREATE OR REPLACE FUNCTION public.get_special_activity_teacher_name(
    activity_teacher_id uuid,
    activity_teacher_name text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    teacher_name_result text;
BEGIN
    -- Try to get name from teachers table
    IF activity_teacher_id IS NOT NULL THEN
        SELECT COALESCE(first_name || ' ', '') || last_name
        INTO teacher_name_result
        FROM teachers
        WHERE id = activity_teacher_id;

        IF teacher_name_result IS NOT NULL THEN
            RETURN teacher_name_result;
        END IF;
    END IF;

    -- Fall back to text field
    RETURN activity_teacher_name;
END;
$$;

COMMENT ON FUNCTION public.get_special_activity_teacher_name
IS 'Helper function to get teacher display name from either teacher_id or teacher_name field';

-- ============================================================================
-- PART 5: Update RLS policies for special_activities (if needed)
-- ============================================================================

-- The existing special_activities RLS policies should continue to work
-- No changes needed here, but verify that school_id-based policies work correctly

-- Log completion
DO $$
DECLARE
    total_activities integer;
    matched_activities integer;
    unmatched_activities integer;
BEGIN
    SELECT COUNT(*) INTO total_activities
    FROM public.special_activities;

    SELECT COUNT(*) INTO matched_activities
    FROM public.special_activities
    WHERE teacher_id IS NOT NULL;

    SELECT COUNT(*) INTO unmatched_activities
    FROM public.special_activities
    WHERE teacher_name IS NOT NULL AND teacher_id IS NULL;

    RAISE NOTICE '=== Special Activities Migration Complete ===';
    RAISE NOTICE 'Total activities: %', total_activities;
    RAISE NOTICE 'Matched to teacher_id: %', matched_activities;
    RAISE NOTICE 'Still using text name: %', unmatched_activities;
    RAISE NOTICE '===========================================';
END $$;
