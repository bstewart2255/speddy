-- SPE-143: privacy / data-deletion tooling
--
-- Make lesson_performance_history cascade when its student is deleted.
--
-- Why: every other child of `students` already deletes via ON DELETE CASCADE, so
-- an admin "delete student" sweeps them up automatically (cascade deletes are
-- performed by the system and bypass the child tables' RLS). lesson_performance_history
-- was the lone exception (ON DELETE NO ACTION). It also has NO delete RLS policy for
-- authenticated users, so even the owning provider cannot remove these rows — meaning
-- a single row here makes its student permanently undeletable through the app. The data
-- is derived analytics (lesson effectiveness history), safe to remove with the student.
--
-- This is the only schema change required for the deletion/retention work; the row
-- deletes themselves continue to run under RLS, and Storage cleanup is handled in
-- application code (Postgres cascade never touches Storage objects).

DO $$
DECLARE
  v_conname text;
BEGIN
  SELECT con.conname
    INTO v_conname
  FROM pg_constraint con
  JOIN pg_class c  ON c.oid  = con.conrelid
  JOIN pg_class cf ON cf.oid = con.confrelid
  WHERE con.contype = 'f'
    AND c.relname  = 'lesson_performance_history'
    AND cf.relname = 'students';

  IF v_conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.lesson_performance_history DROP CONSTRAINT %I', v_conname);
  END IF;

  ALTER TABLE public.lesson_performance_history
    ADD CONSTRAINT lesson_performance_history_student_id_fkey
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
END $$;
