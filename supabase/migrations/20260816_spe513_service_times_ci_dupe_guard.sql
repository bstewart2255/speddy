-- SPE-513 follow-up (CodeRabbit, PR #878): make the service-time duplicate
-- guard case-insensitive, matching the rule every read surface applies.
--
-- period_name is compared trimmed + lowercased everywhere it is consumed
-- (bellTimesKey, getSchoolPeriodGrid's dedup, the modal pre-check, the week
-- view's cell matching), but the original UNIQUE constraint compared the raw
-- text — so "Period 3" and "period 3" could both be stored and then collapse
-- into one cell in the UI. Replace the constraint with a unique index on the
-- normalized key. Same name, so the modal's duplicate-error matching
-- (student_service_times_no_exact_dupes) keeps working, and student_id stays
-- the leading column so the student-lookup role of the old constraint's
-- backing index is preserved. The table is empty pre-launch, so no dedup
-- pass is needed.

BEGIN;

ALTER TABLE public.student_service_times
  DROP CONSTRAINT student_service_times_no_exact_dupes;

CREATE UNIQUE INDEX student_service_times_no_exact_dupes
  ON public.student_service_times
  (student_id, provider_id, day_of_week, lower(btrim(period_name)), school_year);

COMMIT;
