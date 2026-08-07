-- SPE-334 follow-up: restore the cross-provider matcher's free-text fallback to
-- its pre-SPE-334 reach.
--
-- Caught by the deep self-review on PR #812, before merge. The foundation
-- migration is left as-applied rather than rewritten, so this reads as the fix
-- it is (same treatment as 20260729_spe347_children_hardening.sql).
--
-- ---------------------------------------------------------------------------
-- What was wrong
-- ---------------------------------------------------------------------------
-- The pre-SPE-334 fallback in `matching_provider_student_ids` was ROW-keyed:
--
--     (both rows name a teacher AND it is the same teacher)
--     OR (EITHER row names none  AND the free-text teacher_name matches)
--
-- SPE-334 re-expressed it against the CHILD's link set, but translated the
-- second branch as "NEITHER child has a link", where the original says
-- "EITHER row lacks one". That is strictly narrower: a row with a hand-typed
-- teacher name and no teacher_id, compared against a row that HAS one, used to
-- reach the name fallback and no longer did — so a pair the matcher used to
-- call the same child it would now call two.
--
-- Not observable on today's production data (the one free-text-only caseload
-- row has no same-school/initials/grade counterpart, and its child carries no
-- links), which is exactly why it needed catching by reading rather than by
-- watching a count. The claim this ticket makes is behaviour-IDENTICAL, so
-- "narrower in a corner nobody currently occupies" is still wrong.
--
-- ---------------------------------------------------------------------------
-- The fix
-- ---------------------------------------------------------------------------
-- One operator: the two NOT EXISTS guards join with OR, not AND. The first
-- branch already implies both children have links (an overlap cannot exist
-- otherwise), so the pair now reads exactly like the original:
--
--     (the two children share a teacher)
--     OR (EITHER child has no teacher set AND the free-text names match)
--
-- Everything else in the function — including the `provider_id = auth.uid()`
-- gate that keeps a caller from resolving matches for someone else's student —
-- is byte-identical to the SPE-334 version.

CREATE OR REPLACE FUNCTION public.matching_provider_student_ids(p_student_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'pg_temp'
AS $$
BEGIN
  -- Security: only the student's owner may resolve matches.
  IF NOT EXISTS (
    SELECT 1 FROM students WHERE id = p_student_id AND provider_id = auth.uid()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id
  FROM students s
  JOIN students source ON source.id = p_student_id
  LEFT JOIN student_details src_d ON src_d.student_id = source.id
  LEFT JOIN student_details cand_d ON cand_d.student_id = s.id
  WHERE s.id <> p_student_id
    AND s.provider_id <> source.provider_id
    AND s.school_id IS NOT NULL
    AND s.school_id = source.school_id
    AND (
      -- Name-authoritative path: both sides named -> names (+ grade) must agree.
      (
        norm_student_name(src_d.first_name, src_d.last_name) IS NOT NULL
        AND norm_student_name(cand_d.first_name, cand_d.last_name) IS NOT NULL
        AND norm_student_name(src_d.first_name, src_d.last_name)
            = norm_student_name(cand_d.first_name, cand_d.last_name)
        AND s.grade_level = source.grade_level
      )
      OR
      -- Fallback path: a name is missing on at least one side -> initials + grade + teacher.
      (
        (
          norm_student_name(src_d.first_name, src_d.last_name) IS NULL
          OR norm_student_name(cand_d.first_name, cand_d.last_name) IS NULL
        )
        AND LOWER(s.initials) = LOWER(source.initials)
        AND s.grade_level = source.grade_level
        AND (
          -- SPE-334: the two children share at least one teacher.
          EXISTS (
            SELECT 1
            FROM student_teachers a
            JOIN student_teachers b ON b.teacher_id = a.teacher_id
            WHERE a.child_id = s.child_id
              AND b.child_id = source.child_id
          )
          OR (
            -- EITHER child has no teacher set -> fall back to the free-text name,
            -- the same reach the row-keyed `teacher_id IS NULL` test had.
            (
              NOT EXISTS (SELECT 1 FROM student_teachers a WHERE a.child_id = s.child_id)
              OR NOT EXISTS (SELECT 1 FROM student_teachers b WHERE b.child_id = source.child_id)
            )
            AND LOWER(COALESCE(s.teacher_name, '')) = LOWER(COALESCE(source.teacher_name, ''))
            AND COALESCE(s.teacher_name, '') <> ''
          )
        )
      )
    );
END;
$$;

-- The function keeps the grants it already had; CREATE OR REPLACE preserves
-- them and the signature is unchanged, so the 20260529 / 20260531 revoke lists
-- stay accurate as written.

DO $spe334_fallback_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'matching_provider_student_ids'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) LIKE '%EITHER child has no teacher set%'
  ) THEN
    RAISE EXCEPTION 'SPE-334: matching_provider_student_ids fallback fix did not apply';
  END IF;
END;
$spe334_fallback_check$;
