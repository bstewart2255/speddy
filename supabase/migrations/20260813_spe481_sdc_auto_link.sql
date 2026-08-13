-- SPE-481: auto-link SDC dual-role accounts — teachers.account_id is the gate
-- for the mainstreaming features (SPE-478), and nothing created it for the
-- SDC shape: gen-ed teacher-login creation links automatically, the SIS sync
-- links accounts it creates, but PROVIDER accounts and classroom-directory
-- entries arrive through separate flows and stayed unlinked (found in prod:
-- all four Rodeo Hills SDC teachers had both halves, zero links; the
-- linkTeacherToProfile query function exists but no UI calls it).
--
-- The rule, applied in BOTH entry orders so it can never be missed (owner
-- decision 2026-08-13):
--   * classroom entry arrives (admin add / CSV / SIS / any future path) →
--     link if it exactly matches a Resource Specialist profile;
--   * provider profile arrives or gains its email/school/role → link any
--     waiting classroom entry.
--
-- Guardrails: exact email match (case-insensitive), same school_id
-- (primary-school match only for multi-school providers — conservative),
-- role = 'resource' only (the documented SDC convention, SPE-355; a speech
-- provider never silently gains the gate), never overwrites an existing
-- link, and acts only when the match is unambiguous.
--
-- Database-level on purpose: a trigger catches every entry path in one
-- place, in either order, including flows that don't exist yet. Both
-- functions are SECURITY DEFINER — the deciding read (profiles ↔ teachers)
-- must not depend on the inserting role's RLS view.

BEGIN;

-- ---------------------------------------------------------------------------
-- Order A: classroom entry arrives after (or without) the provider account
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdc_autolink_on_teacher_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  match_count integer;
  matched_profile uuid;
BEGIN
  IF NEW.account_id IS NOT NULL OR NEW.email IS NULL OR NEW.school_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*), min(p.id::text)::uuid
    INTO match_count, matched_profile
  FROM profiles p
  WHERE lower(p.email) = lower(NEW.email)
    AND p.school_id = NEW.school_id
    AND p.role = 'resource';

  IF match_count = 1 THEN
    NEW.account_id := matched_profile;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sdc_autolink_on_teacher_write() IS
  'SPE-481: BEFORE INSERT on teachers — if the new unlinked entry exactly matches one Resource Specialist profile (email + school), link it. The SDC dual-role gate (SPE-478) depends on this link existing.';

CREATE TRIGGER trg_teachers_sdc_autolink
  BEFORE INSERT ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.sdc_autolink_on_teacher_write();

-- ---------------------------------------------------------------------------
-- Order B: provider account arrives after the classroom entry — including
-- creation flows that set school_id in a second step (create-teacher-account
-- does; provider creation may), hence UPDATE OF the deciding columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sdc_autolink_on_profile_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.role <> 'resource' OR NEW.email IS NULL OR NEW.school_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.teachers t
  SET account_id = NEW.id
  WHERE t.account_id IS NULL
    AND t.email IS NOT NULL
    AND t.school_id = NEW.school_id
    AND lower(t.email) = lower(NEW.email)
    -- Ambiguity guard (belt and braces — auth emails are unique): stand down
    -- if a SECOND resource profile also matches this entry.
    AND NOT EXISTS (
      SELECT 1 FROM profiles p2
      WHERE p2.id <> NEW.id
        AND p2.role = 'resource'
        AND p2.school_id = t.school_id
        AND lower(p2.email) = lower(t.email)
    );
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.sdc_autolink_on_profile_write() IS
  'SPE-481: AFTER INSERT/UPDATE on profiles — when a Resource Specialist account appears (or gains its email/school), link any waiting unlinked classroom entry that exactly matches. Mirror of sdc_autolink_on_teacher_write.';

CREATE TRIGGER trg_profiles_sdc_autolink
  AFTER INSERT OR UPDATE OF email, school_id, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.sdc_autolink_on_profile_write();

-- ---------------------------------------------------------------------------
-- One-time backfill: the identical rule over existing data, with the
-- exactly-one guard enforced on BOTH sides. Previewed read-only before this
-- migration was applied: six 1:1 matches, all JSUSD (four Rodeo Hills SDC
-- teachers + the two John Swett High SDC/Resource hybrids), zero ambiguous.
-- ---------------------------------------------------------------------------
WITH candidates AS (
  SELECT t.id AS teacher_row, p.id AS profile_id
  FROM teachers t
  JOIN profiles p
    ON lower(p.email) = lower(t.email)
   AND p.school_id = t.school_id
   AND p.role = 'resource'
  WHERE t.account_id IS NULL
    AND t.email IS NOT NULL
    AND t.school_id IS NOT NULL
),
unambiguous AS (
  SELECT c.teacher_row, c.profile_id
  FROM candidates c
  WHERE (SELECT count(*) FROM candidates c2 WHERE c2.teacher_row = c.teacher_row) = 1
    AND (SELECT count(*) FROM candidates c3 WHERE c3.profile_id = c.profile_id) = 1
)
UPDATE public.teachers t
SET account_id = u.profile_id
FROM unambiguous u
WHERE t.id = u.teacher_row;

COMMIT;
