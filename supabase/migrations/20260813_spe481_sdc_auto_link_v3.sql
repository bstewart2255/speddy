-- SPE-481 v3: serialize linking per account (CodeRabbit's one-to-one point
-- on PR #858, sharpened).
--
-- v2's stand-down guards handle every SERIAL case, but two simultaneous
-- writers (e.g. duplicate directory rows inserted in the same instant)
-- could each pass the "no linked row yet" check before seeing the other's
-- uncommitted link — creating the duplicate state the guards exist to
-- prevent. Unlike the documented concurrent-miss edge (benign: degrades to
-- pre-SPE-481 and self-repairs on any later edit), a concurrent DUPLICATE
-- link is a bad state that persists.
--
-- Fix with the house pattern (SPE-141's per-provider capacity lock): both
-- functions take the same per-account advisory lock before deciding, so
-- link attempts for one account serialize and the second writer sees the
-- first's committed link. The lock is transaction-scoped and per-account —
-- no contention across different accounts.

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

  IF match_count <> 1 THEN
    RETURN NEW;
  END IF;

  -- Serialize link attempts for this account, then decide on committed state.
  PERFORM pg_advisory_xact_lock(hashtextextended('sdc_autolink:' || matched_profile::text, 0));

  IF NOT EXISTS (SELECT 1 FROM teachers t2 WHERE t2.account_id = matched_profile) THEN
    NEW.account_id := matched_profile;
  END IF;
  RETURN NEW;
END;
$$;

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

  -- Same per-account lock as the teacher-side function, so the two
  -- directions serialize against each other as well.
  PERFORM pg_advisory_xact_lock(hashtextextended('sdc_autolink:' || NEW.id::text, 0));

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
