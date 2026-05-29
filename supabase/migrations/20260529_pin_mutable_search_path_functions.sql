-- SPE-13: Pin search_path on the five functions flagged by the Supabase
-- security advisor (function_search_path_mutable).
--
-- A role-mutable search_path lets a caller prepend a schema that shadows
-- expected identifiers; combined with SECURITY DEFINER (true for three of
-- these) it is a known privilege-escalation vector. Pinning to a fixed,
-- trusted path closes it. Behavior is unchanged: these functions only
-- reference objects in the public schema (pg_temp is included last per
-- PostgreSQL guidance).
ALTER FUNCTION public.sync_is_template()                       SET search_path = public, pg_temp;
ALTER FUNCTION public.update_attendance_updated_at()           SET search_path = public, pg_temp;
ALTER FUNCTION public.get_student_school_id(uuid)             SET search_path = public, pg_temp;
ALTER FUNCTION public.get_student_district_id(uuid)           SET search_path = public, pg_temp;
ALTER FUNCTION public.copy_schedule_to_year(text, text, text) SET search_path = public, pg_temp;
