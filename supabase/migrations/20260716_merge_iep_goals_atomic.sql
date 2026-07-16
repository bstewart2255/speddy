-- SPE-259: Make the per-student IEP goal merge atomic (read-merge-write race).
--
-- The per-student IEP goals confirm route (/api/import-iep-goals/confirm, SPE-234)
-- merged goals with a non-atomic read-merge-write in app code: read existing
-- iep_goals, compute the merged array in JS (mergeGoals), then upsert. Two
-- concurrent confirmations for the same student could read the same baseline and
-- overwrite each other, dropping a goal.
--
-- This moves the read-merge-write into the database so it happens under a single
-- row lock, mirroring the bulk path's import_student_atomic. The merge itself is
-- append-only with a case-insensitive, whitespace-trimmed de-dupe, matching
-- lib/import/merge-goals.ts (the JS reference the route previously used).

-- Append-only merge of IEP goals. Existing goals keep their order and original
-- casing; an incoming goal is appended only when no current goal matches it
-- after trimming + lowercasing (so incoming also de-dupes against itself and
-- against existing). Pure — mirrors mergeGoals() in lib/import/merge-goals.ts.
CREATE OR REPLACE FUNCTION public.merge_iep_goals_array(
  p_existing text[],
  p_incoming text[]
)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
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
$$;

COMMENT ON FUNCTION public.merge_iep_goals_array(text[], text[]) IS
  'Append-only, case-insensitive + whitespace-trimmed de-dupe merge of IEP goals. Mirrors mergeGoals() in lib/import/merge-goals.ts.';

-- Atomically merge selected IEP goals into each student the caller owns.
--
-- Input p_entries is a JSON array of { studentId, goals, iepDate }, matching the
-- request the confirm route forwards. Returns one row per input entry, in input
-- order (via ord), so the caller maps results back by position. Semantics mirror
-- the previous app-side loop exactly:
--   * a non-UUID / not-owned studentId  -> per-row "not found" failure
--   * an entry with no goals            -> no-op success (nothing written)
--   * otherwise                         -> append-only merge into student_details
-- Each row's write is wrapped so a single failure doesn't roll back the entries
-- already merged in this call (matching the route's per-row try/catch). The
-- INSERT ... ON CONFLICT DO UPDATE computes the merged array from the CURRENT row
-- value under the conflict row lock, so concurrent merges into the same student
-- serialize instead of overwriting each other.
CREATE OR REPLACE FUNCTION public.merge_iep_goals(
  p_provider_id uuid,
  p_entries jsonb
)
-- `matched_student_id` (not `student_id`) so the output column doesn't collide
-- with student_details.student_id inside the INSERT ... ON CONFLICT below
-- (a same-named OUT variable makes that column reference ambiguous).
RETURNS TABLE (
  ord integer,
  matched_student_id uuid,
  success boolean,
  error_message text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry jsonb;
  v_ord integer := -1;
  v_student_id uuid;
  v_goals text[];
  v_iep_date text;
  v_owned boolean;
BEGIN
  IF p_entries IS NULL OR jsonb_typeof(p_entries) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_entry IN SELECT jsonb_array_elements(p_entries)
  LOOP
    v_ord := v_ord + 1;
    ord := v_ord;
    matched_student_id := NULL;
    success := false;
    error_message := NULL;

    -- Parse studentId; a non-UUID can't be one of the caller's students.
    BEGIN
      v_student_id := (v_entry->>'studentId')::uuid;
    EXCEPTION WHEN others THEN
      v_student_id := NULL;
    END;

    IF v_student_id IS NULL THEN
      error_message := 'Student not found in your caseload';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Ownership: only students belonging to the caller may be written.
    SELECT EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = v_student_id AND s.provider_id = p_provider_id
    ) INTO v_owned;

    IF NOT v_owned THEN
      matched_student_id := v_student_id;
      error_message := 'Student not found in your caseload';
      RETURN NEXT;
      CONTINUE;
    END IF;

    -- Well-formed goal strings only; an entry with none is a no-op skip.
    SELECT COALESCE(array_agg(g) FILTER (WHERE g IS NOT NULL), ARRAY[]::text[])
      INTO v_goals
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(v_entry->'goals') = 'array' THEN v_entry->'goals' ELSE '[]'::jsonb END
      ) AS g;

    v_iep_date := NULLIF(v_entry->>'iepDate', '');

    IF array_length(v_goals, 1) IS NULL THEN
      matched_student_id := v_student_id;
      success := true;
      RETURN NEXT;
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.student_details AS sd (student_id, iep_goals, goals_iep_date, updated_at)
      VALUES (
        v_student_id,
        public.merge_iep_goals_array(ARRAY[]::text[], v_goals),
        v_iep_date::date,
        now()
      )
      ON CONFLICT (student_id) DO UPDATE
        SET iep_goals = public.merge_iep_goals_array(sd.iep_goals, EXCLUDED.iep_goals),
            goals_iep_date = COALESCE(EXCLUDED.goals_iep_date, sd.goals_iep_date),
            updated_at = now();

      matched_student_id := v_student_id;
      success := true;
      RETURN NEXT;
    EXCEPTION WHEN others THEN
      -- Per-row isolation: a failed row doesn't roll back rows already merged.
      matched_student_id := v_student_id;
      success := false;
      error_message := 'Failed to save goals';
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.merge_iep_goals(uuid, jsonb) IS
  'Atomically merges selected IEP goals into each student owned by p_provider_id. Per-student import (append + de-dupe), the atomic replacement for the app-side read-merge-write (SPE-259). Returns one row per input entry (ord = input index).';

-- Match the grant pattern of the other import RPCs (import_student_atomic,
-- upsert_students_atomic): callable by authenticated users, ownership enforced
-- inside the function via p_provider_id.
GRANT EXECUTE ON FUNCTION public.merge_iep_goals_array(text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_iep_goals(uuid, jsonb) TO authenticated;
