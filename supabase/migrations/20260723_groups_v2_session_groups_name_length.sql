-- Groups v2 (SPE-311) — enforce the group-name length limit in Postgres.
--
-- The /api/groups/mutate route caps `name` at 80 via zod, but the groups_v2_*
-- SECURITY DEFINER RPCs are executable directly by `authenticated` clients, and
-- session_groups.name had no matching constraint. A table CHECK bounds every
-- write path (form/rename/legacy group route/backfill) uniformly. Verified
-- before adding: existing names max 15 chars, none violate. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_groups_name_len') THEN
    ALTER TABLE public.session_groups
      ADD CONSTRAINT session_groups_name_len CHECK (name IS NULL OR char_length(name) <= 80);
  END IF;
END $$;
