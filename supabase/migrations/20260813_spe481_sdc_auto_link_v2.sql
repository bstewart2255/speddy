-- SPE-481 v2: review fixes on the auto-link triggers (PR #858 — self-review
-- + Codex, converging on the same two gaps).
--
-- 1. EDITS NOW LINK (Codex P1 / self-review #1). The teacher-side trigger
--    fired on INSERT only, so correcting an entry's email (admin edit flow,
--    SIS refresh) after the fact never created the link — recreating the
--    exact invisible-unlinked state SPE-481 exists to kill. Fire on UPDATE
--    of the deciding columns too.
--
-- 2. ONE LINKED ROW PER ACCOUNT (Codex P2 / self-review #2). Directory
--    duplicates are possible (no unique email per school), and the triggers
--    enforced the exactly-one guard on only one side: the profile-side
--    UPDATE could link EVERY matching duplicate in one statement, and the
--    teacher-side could link a duplicate beside an existing linked row —
--    double-exposing every `teachers.account_id = auth.uid()` RLS branch
--    and breaking `.single()` consumers. Both sides now stand down unless
--    the account has no linked row and the match is one-to-one.
--
-- Accepted, documented edge (self-review #3): two truly concurrent inserts
-- (entry + profile committing in the same instant) can each miss the other
-- under READ COMMITTED and both land unlinked. The window is milliseconds,
-- the failure is the pre-SPE-481 status quo (not corruption), and with (1)
-- widening the repair surface, ANY later edit of either half's deciding
-- columns re-fires the link. Closing it fully needs serialized locking that
-- this concierge-scale convenience doesn't warrant.

BEGIN;

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

  -- One-to-one only: exactly one profile matches AND that profile has no
  -- linked classroom row already (a duplicate entry must not become a
  -- second row answering for the same account).
  IF match_count = 1
     AND NOT EXISTS (
       SELECT 1 FROM teachers t2 WHERE t2.account_id = matched_profile
     ) THEN
    NEW.account_id := matched_profile;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_teachers_sdc_autolink ON public.teachers;
CREATE TRIGGER trg_teachers_sdc_autolink
  BEFORE INSERT OR UPDATE OF email, school_id ON public.teachers
  FOR EACH ROW EXECUTE FUNCTION public.sdc_autolink_on_teacher_write();

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

  -- Stand down unless the account has no linked row and exactly ONE
  -- unlinked entry matches — the mirror of the teacher-side guard.
  IF EXISTS (SELECT 1 FROM teachers t0 WHERE t0.account_id = NEW.id) THEN
    RETURN NULL;
  END IF;
  IF (SELECT count(*) FROM teachers tc
      WHERE tc.account_id IS NULL
        AND tc.email IS NOT NULL
        AND tc.school_id = NEW.school_id
        AND lower(tc.email) = lower(NEW.email)) <> 1 THEN
    RETURN NULL;
  END IF;

  UPDATE public.teachers t
  SET account_id = NEW.id
  WHERE t.account_id IS NULL
    AND t.email IS NOT NULL
    AND t.school_id = NEW.school_id
    AND lower(t.email) = lower(NEW.email)
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

COMMIT;
