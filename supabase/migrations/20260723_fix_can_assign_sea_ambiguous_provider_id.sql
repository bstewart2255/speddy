-- Fix: can_assign_sea_to_session(provider_id, sea_id, session_id) referenced its
-- `provider_id` PARAMETER unqualified inside a query over provider_schools, which
-- ALSO has a `provider_id` column → "column reference provider_id is ambiguous".
--
-- That branch only runs when a provider assigns at a NON-primary school (the
-- primary-school equality check short-circuits before it), so the bug lay latent
-- in the existing per-session SEA-assign flow and was surfaced by Groups v2
-- whole-group assign (which runs the same permission trigger over every member).
--
-- The parameter is qualified with the function name — identical value, the query
-- now parses. Pure fix, no behavior change. Idempotent (CREATE OR REPLACE).
CREATE OR REPLACE FUNCTION public.can_assign_sea_to_session(provider_id uuid, sea_id uuid, session_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  provider_record RECORD;
  sea_record RECORD;
  student_school_id VARCHAR;
  provider_works_at_school BOOLEAN;
  sea_works_at_school BOOLEAN;
BEGIN
  SELECT school_district, school_site, school_id, role
  INTO provider_record FROM profiles WHERE id = provider_id;

  IF provider_record.role != 'resource' THEN RETURN FALSE; END IF;

  SELECT school_district, school_site, school_id, role
  INTO sea_record FROM profiles WHERE id = sea_id;

  IF sea_record.role != 'sea' THEN RETURN FALSE; END IF;

  IF session_id IS NOT NULL THEN
    SELECT s.school_id INTO student_school_id
    FROM schedule_sessions ss JOIN students s ON ss.student_id = s.id
    WHERE ss.id = session_id;

    IF student_school_id IS NOT NULL THEN
      provider_works_at_school := (provider_record.school_id = student_school_id);
      IF NOT provider_works_at_school THEN
        provider_works_at_school := EXISTS (
          SELECT 1 FROM provider_schools ps
          WHERE ps.provider_id = can_assign_sea_to_session.provider_id
            AND ps.school_id = student_school_id
        );
      END IF;

      sea_works_at_school := (sea_record.school_id = student_school_id);
      IF NOT sea_works_at_school THEN
        sea_works_at_school := EXISTS (
          SELECT 1 FROM provider_schools ps
          WHERE ps.provider_id = sea_id
            AND ps.school_id = student_school_id
        );
      END IF;

      IF provider_works_at_school AND sea_works_at_school THEN
        RETURN TRUE;
      ELSE
        RETURN FALSE;
      END IF;
    END IF;
  END IF;

  IF provider_record.school_id IS NOT NULL AND sea_record.school_id IS NOT NULL THEN
    IF provider_record.school_id = sea_record.school_id THEN RETURN TRUE; END IF;
  ELSIF provider_record.school_district IS NOT NULL AND provider_record.school_site IS NOT NULL THEN
    IF provider_record.school_district = sea_record.school_district
       AND provider_record.school_site = sea_record.school_site THEN RETURN TRUE; END IF;
  END IF;

  RETURN FALSE;
END;
$function$;
