-- SPE-334 follow-up #2: gate the matcher's free-text fallback on the ROW's own
-- teacher_id, the way it always was.
--
-- Supersedes 20260807_spe334_matching_fallback_fidelity.sql, from the same
-- pre-merge review round on PR #812. Both earlier steps are left as-applied so
-- the sequence reads as the correction it is (SPE-347's hardening precedent).
--
-- ---------------------------------------------------------------------------
-- The three versions, and why this is the last one
-- ---------------------------------------------------------------------------
-- ORIGINAL (pre-SPE-334), row-keyed:
--     (s.teacher_id IS NULL OR source.teacher_id IS NULL) AND names match
--
-- SPE-334 as first applied: translated that to "NEITHER child has a link",
--     which was narrower on two counts. Caught by self-review.
--
-- _fidelity (previous step): relaxed AND -> OR, giving
--     "EITHER child has no link". That fixed the operator but kept the test at
--     CHILD level, and CodeRabbit's review named the remaining gap precisely:
--     `teacher_name` is a ROW-level column, so a link contributed by a SIBLING
--     caseload row of the same child would close the fallback for a row whose
--     own teacher is still nothing but typed-in text. Shape: an OT adds a
--     caseload row for a child an RSP already serves and types a teacher name
--     without picking a directory record. Zero instances in production today
--     (no child has a mix of teacher-bearing and teacher-less copies), but
--     creatable through the ordinary add-student form — and this ticket's whole
--     claim is behaviour-IDENTICAL, which "identical except in a shape a user
--     can still produce" does not satisfy.
--
-- THIS STEP restores the original predicate verbatim. Note the operator: the
-- review's suggested patch proposed
--     s.teacher_id IS NULL AND source.teacher_id IS NULL
-- which would have been narrower than the original in the other direction —
-- closing the fallback whenever only ONE side lacks a teacher, which is exactly
-- the case the original OR exists to serve. The diagnosis was right; the patch
-- was not, so only the diagnosis is taken here.
--
-- ---------------------------------------------------------------------------
-- What SPE-334 does change here, deliberately
-- ---------------------------------------------------------------------------
-- The FIRST branch — "the two rows name the same teacher" — becomes link-set
-- overlap, which is what the ticket asked for and is a genuine (intended)
-- widening: two children who share any teacher now match, where before only an
-- exact same-single-teacher pair did. That cannot fire on today's data (no
-- child carries more than one link) and is the correct semantics once secondary
-- rostering fills the table.
--
-- The SECOND branch is pure compatibility for rows that never got a teacher
-- record at all, and is now untouched by this ticket.

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
          -- SPE-334: the two children share at least one teacher. Replaces the
          -- old "both rows name the same teacher" test.
          EXISTS (
            SELECT 1
            FROM student_teachers a
            JOIN student_teachers b ON b.teacher_id = a.teacher_id
            WHERE a.child_id = s.child_id
              AND b.child_id = source.child_id
          )
          OR (
            -- Either ROW names no teacher record -> compare the free-text name.
            -- Verbatim from the pre-SPE-334 definition; a row-level column gets
            -- a row-level test.
            (s.teacher_id IS NULL OR source.teacher_id IS NULL)
            AND LOWER(COALESCE(s.teacher_name, '')) = LOWER(COALESCE(source.teacher_name, ''))
            AND COALESCE(s.teacher_name, '') <> ''
          )
        )
      )
    );
END;
$$;

DO $spe334_row_keyed_check$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'matching_provider_student_ids'
      AND p.prosecdef
      AND pg_get_functiondef(p.oid) LIKE '%Either ROW names no teacher record%'
  ) THEN
    RAISE EXCEPTION 'SPE-334: matching_provider_student_ids row-keyed fallback did not apply';
  END IF;
END;
$spe334_row_keyed_check$;
