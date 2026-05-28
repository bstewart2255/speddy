-- Remove the legacy SEA supervising-provider model.
-- SEAs now belong to schools; assignment is school/session based, so the
-- profiles.supervising_provider_id and profiles.shared_at_school columns are
-- obsolete. This migration rewrites lesson access to be assignment-based
-- (the only RLS policy that depended on supervising_provider_id), refreshes
-- the SEA lookup functions, and drops the columns.

-- 1. Lessons access: a SEA previously saw a provider's lessons when their
-- supervising_provider_id matched. Replace that with assignment-based access:
-- a SEA sees lessons of any provider who has a session assigned to that SEA.
DROP POLICY IF EXISTS lessons_user_access ON public.lessons;
CREATE POLICY lessons_user_access ON public.lessons
  FOR ALL
  USING (
    (SELECT auth.uid()) = provider_id
    OR EXISTS (
      SELECT 1 FROM public.schedule_sessions ss
      WHERE ss.assigned_to_sea_id = (SELECT auth.uid())
        AND ss.provider_id = lessons.provider_id
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = provider_id
  );

-- 2. Drop the unused legacy lookup that returned supervising_provider_id
-- (superseded by get_school_seas; not called from application code).
DROP FUNCTION IF EXISTS public.get_available_seas(uuid, uuid);

-- 3. Recreate the school SEA lookup without supervising_provider_id.
-- Changing the return shape requires a drop + create.
DROP FUNCTION IF EXISTS public.get_school_seas(varchar, varchar, varchar);
CREATE FUNCTION public.get_school_seas(
  p_school_id varchar DEFAULT NULL,
  p_school_site varchar DEFAULT NULL,
  p_school_district varchar DEFAULT NULL
)
RETURNS TABLE(id uuid, full_name text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_school_id IS NOT NULL THEN
    RETURN QUERY
    SELECT p.id, p.full_name
    FROM profiles p
    WHERE p.role = 'sea'
      AND p.school_id = p_school_id
    ORDER BY p.full_name;
  ELSE
    RETURN QUERY
    SELECT p.id, p.full_name
    FROM profiles p
    WHERE p.role = 'sea'
      AND p.school_site = p_school_site
      AND p.school_district = p_school_district
    ORDER BY p.full_name;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_seas(varchar, varchar, varchar)
  TO authenticated, anon, service_role;

-- 4. Drop the now-unused columns. The self-referencing FK
-- (profiles_supervising_provider_id_fkey) is removed with the column.
ALTER TABLE public.profiles DROP COLUMN IF EXISTS supervising_provider_id;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS shared_at_school;
