-- SPE-269: school-aware student identity.
--
-- Student identity was keyed on (provider_id, grade_level, initials) — school-
-- blind — so one provider could not have the same initials+grade at two schools,
-- and a cross-school import falsely collided on confirm ("already exists"). With
-- SPE-266 the precise "same student?" decision is name-based in the app layer;
-- this database backstop becomes school-aware so identity is scoped per school.
--
-- No production student data to preserve at time of writing (owner confirmed),
-- so no data backfill/cleanup is required here.

-- Drop the school-blind uniqueness (a plain unique index) ...
DROP INDEX IF EXISTS public.ux_students_provider_grade_initials;

-- ... and the legacy initials+grade+teacher_name unique constraint (and its
-- backing index, defensively, in case it exists as a bare index somewhere).
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_provider_id_initials_grade_level_teacher_name_key;
DROP INDEX IF EXISTS public.students_provider_id_initials_grade_level_teacher_name_key;

-- School-aware uniqueness backstop. NULLS NOT DISTINCT so students without a
-- school_id still dedup by (provider, grade, initials) instead of slipping the
-- backstop entirely (Postgres treats NULLs as distinct in unique indexes by
-- default, which would allow unlimited null-school duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS ux_students_provider_school_grade_initials
  ON public.students (provider_id, school_id, grade_level, initials) NULLS NOT DISTINCT;

COMMENT ON INDEX public.ux_students_provider_school_grade_initials IS
  'Student identity backstop, school-aware (SPE-269): unique per provider + school + grade + initials, so the same initials+grade can exist at different schools. Precise same-student matching is name-based in the app layer (SPE-266).';
