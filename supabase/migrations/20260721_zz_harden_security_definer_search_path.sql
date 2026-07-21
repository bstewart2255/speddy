-- SPE-289: harden SECURITY DEFINER (and one flagged) functions — pin pg_temp LAST.
--
-- Even a function that sets `search_path = public[, auth]` still searches pg_temp IMPLICITLY
-- FIRST for relation names unless pg_temp appears explicitly. A caller able to create temp
-- objects could therefore shadow an unqualified table reference under definer privileges
-- (PostgreSQL docs recommend putting pg_temp last). Setting pg_temp explicitly LAST closes
-- that vector: public (and auth/pg_catalog/extensions where already present) is searched
-- first, pg_temp only after — so no temp object can shadow a real one.
--
-- Scope / safety:
--   * Verified against prod: NONE of these SECURITY DEFINER functions create temp tables,
--     so appending pg_temp last is behaviorally inert — it only changes resolution ORDER,
--     never what an existing reference resolves to. Applied via ALTER FUNCTION (no body
--     rewrite), so function logic / ACLs / volatility / return types are untouched.
--   * merge_iep_goals_array is the one function Supabase's linter (function_search_path_mutable)
--     actively flags — it had NO search_path at all. It is SECURITY INVOKER + IMMUTABLE and
--     references no tables (pure array/string ops), so its real risk is nil, but we pin a
--     search_path to clear the advisor. Body reproduced verbatim.
--   * Active risk is low: authenticated users reach these only through PostgREST
--     (/rest/v1/rpc/...), which does not permit CREATE TEMP TABLE, so the vector isn't reachable
--     via the app. This is defense-in-depth / consistency.
--   * Deferred (documented): schema-qualifying every relation ref in the bodies (public.students,
--     etc.). pg_temp-last already closes the shadowing vector; qualifying ~60 bodies is redundant
--     belt-and-suspenders carrying real regression risk, so it is intentionally NOT done here.
--
-- Drift-safety (why a DO block, not 61 explicit ALTERs): some functions exist in prod but were
-- never committed as CREATE FUNCTION migrations (schema drift, e.g. can_view_team_member). A
-- hardcoded `ALTER FUNCTION` on an absent function aborts the whole migration on a fresh replay
-- (`supabase db reset` / CI rebuild from committed migrations). Looping pg_proc at run time hardens
-- exactly the SECURITY DEFINER functions that EXIST — drift-only names are simply skipped, never a
-- hard error — and it's idempotent (skips any already ending in pg_temp) and self-adjusting.
--
-- Ordering: this alters functions created by earlier migrations (incl. today's
-- find_matching_provider_sessions[_batch] / matching_provider_student_ids / get_sea_students),
-- so on a fresh replay it MUST run after all of them — hence the `zz_` filename (sorts last).

-- 1. The advisor-flagged function: add a fixed search_path (pg_temp last). SECURITY INVOKER,
--    IMMUTABLE, body verbatim. CREATE OR REPLACE is safe on replay whether or not it pre-exists.
CREATE OR REPLACE FUNCTION public.merge_iep_goals_array(p_existing text[], p_incoming text[])
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_merged text[] := COALESCE(p_existing, ARRAY[]::text[]);
  v_goal text;
BEGIN
  IF p_incoming IS NULL THEN
    RETURN v_merged;
  END IF;

  FOREACH v_goal IN ARRAY p_incoming LOOP
    IF v_goal IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM unnest(v_merged) AS e
      WHERE lower(regexp_replace(e, '^\s+|\s+$', '', 'g'))
          = lower(regexp_replace(v_goal, '^\s+|\s+$', '', 'g'))
    ) THEN
      v_merged := array_append(v_merged, v_goal);
    END IF;
  END LOOP;

  RETURN v_merged;
END;
$function$;

-- 2. Pin pg_temp LAST on every SECURITY DEFINER function in public that has an explicit
--    search_path lacking it. Existing schemas (auth / pg_catalog / extensions) are preserved;
--    only pg_temp is appended. Functions that already end in pg_temp, and any that exist in prod
--    but not in the committed migrations (drift), are left untouched — see drift-safety note above.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS args,
      (SELECT split_part(cfg, '=', 2)
         FROM unnest(p.proconfig) cfg
         WHERE cfg LIKE 'search_path=%' LIMIT 1) AS cur_path
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg WHERE cfg LIKE 'search_path=%'
      )
      AND NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) cfg
        WHERE cfg LIKE 'search_path=%' AND cfg ~ '(^|[ ,])pg_temp([ ,]|$)'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION public.%I(%s) SET search_path = %s, pg_temp',
      r.proname, r.args, r.cur_path
    );
    RAISE NOTICE 'SPE-289 hardened %(%): search_path = %, pg_temp', r.proname, r.args, r.cur_path;
  END LOOP;
END $$;
