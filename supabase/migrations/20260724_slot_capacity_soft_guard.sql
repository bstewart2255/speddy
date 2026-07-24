-- SPE-141 §2 — Soft slot-capacity guard (overbooking backstop)
--
-- Problem: the 8-concurrent-sessions-per-provider cap is enforced ONLY in the
-- browser, against a client cache that can be up to 15 minutes stale
-- (lib/scheduling/scheduling-data-manager.ts) and with no atomic re-check at
-- write time. Two writers racing (or one on a stale cache) can push a slot past
-- the cap with nothing at the DB layer to notice.
--
-- Fix (soft): a BEFORE INSERT/UPDATE trigger that does NOT reject the write —
-- providers keep the deliberate-override behavior the drag path already allows —
-- but FLAGS any write that pushes a provider's concurrent template-session count
-- over the cap, by setting the generic has_conflict flag (+ needs_attention +
-- a reason). This reuses the existing "needs attention" UI (no client changes to
-- surface it) and the existing capacity-aware reconciler
-- (session-update-service.ts#reconcileStaleConflictsForProvider /
-- clearStaleConflictsForStudent), which re-derives capacity via the SAME rule and
-- so KEEPS the flag while the slot is over capacity and CLEARS it once resolved.
--
-- "Slot" = per-provider, per-weekday, per-overlapping-time-range, over live
-- recurring template rows (session_date IS NULL). Dated instances are generated
-- from (now-guarded) templates and are additionally protected against
-- student-level double-booking by unique_session_per_date, so they are out of
-- scope here.
--
-- The capacity math mirrors checkConcurrentSessionLimit exactly (per-minute peak
-- concurrency of OTHER sessions; the cap-th other makes NEW the (cap+1)-th), so
-- the trigger and the app reconciler never disagree.
--
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_flag_session_over_capacity ON public.schedule_sessions;
--   DROP FUNCTION IF EXISTS public.flag_session_over_capacity();

CREATE OR REPLACE FUNCTION public.flag_session_over_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  -- Keep in sync with DEFAULT_SCHEDULING_CONFIG.maxConcurrentSessions.
  cap CONSTANT integer := 8;
  peak integer;
BEGIN
  -- Only live, scheduled, recurring template rows define a capacity slot. A
  -- zero-/negative-length row (end <= start) occupies no time, so it can't add to
  -- any slot's occupancy — skip it too (matches checkConcurrentSessionLimit, whose
  -- per-minute loop iterates zero minutes when end <= start).
  IF NEW.session_date IS NOT NULL
     OR NEW.deleted_at IS NOT NULL
     OR NEW.provider_id IS NULL
     OR NEW.day_of_week IS NULL
     OR NEW.start_time IS NULL
     OR NEW.end_time IS NULL
     OR NEW.end_time <= NEW.start_time THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, skip the recount when no slot-defining field changed — notes,
  -- grouping, completion and assignment edits cannot change slot occupancy.
  IF TG_OP = 'UPDATE'
     AND NEW.provider_id  IS NOT DISTINCT FROM OLD.provider_id
     AND NEW.day_of_week  IS NOT DISTINCT FROM OLD.day_of_week
     AND NEW.start_time   IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time     IS NOT DISTINCT FROM OLD.end_time
     AND NEW.session_date IS NOT DISTINCT FROM OLD.session_date
     AND NEW.deleted_at   IS NOT DISTINCT FROM OLD.deleted_at THEN
    RETURN NEW;
  END IF;

  -- Best-effort serialization: TRY (never block) to take the per-(provider,day)
  -- lock so a concurrent writer's count sees ours. A *blocking* lock held by a
  -- long batch-save transaction could push a concurrent writer to the same day
  -- past statement_timeout and FAIL its write — which this soft guard must never
  -- do — or deadlock two multi-slot batch writes. On contention we proceed
  -- unlocked; the primary win (counting fresh committed state instead of the
  -- stale ≤15-min client cache) still holds, and the rare truly-simultaneous race
  -- is re-derived and flagged by reconcileStaleConflictsForProvider on next view.
  PERFORM pg_try_advisory_xact_lock(
    hashtextextended(NEW.provider_id::text || ':' || NEW.day_of_week::text, 0)
  );

  -- Peak number of OTHER live template sessions for this provider+day concurrent
  -- at any instant within NEW's [start, end). Concurrency only rises at a session
  -- start, so evaluating at NEW.start_time and at each other session's start_time
  -- inside the span yields the maximum — equivalent to checkConcurrentSessionLimit's
  -- per-minute scan (start-inclusive, end-exclusive).
  WITH others AS (
    SELECT s.start_time, s.end_time
    FROM public.schedule_sessions s
    WHERE s.provider_id = NEW.provider_id
      AND s.day_of_week = NEW.day_of_week
      AND s.session_date IS NULL
      AND s.deleted_at IS NULL
      AND s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
      AND s.id <> NEW.id
  ),
  instants(t) AS (
    SELECT NEW.start_time
    UNION
    SELECT o.start_time FROM others o
    WHERE o.start_time >= NEW.start_time AND o.start_time < NEW.end_time
  )
  SELECT COALESCE(MAX(cnt), 0) INTO peak
  FROM (
    SELECT (
      SELECT count(*) FROM others o
      WHERE o.start_time <= i.t AND o.end_time > i.t
    ) AS cnt
    FROM instants i
  ) x;

  -- With `cap` OTHERS already concurrent, NEW would be the (cap+1)-th. Flag it,
  -- but never clobber a conflict reason the app already set (e.g. a bell-schedule
  -- or special-activity conflict), and never downgrade a harder 'conflict' status.
  IF peak >= cap THEN
    NEW.has_conflict := true;
    IF NEW.status = 'active' THEN
      NEW.status := 'needs_attention';
    END IF;
    IF NEW.conflict_reason IS NULL THEN
      NEW.conflict_reason := format(
        'Over capacity: %s sessions overlap this time (max %s)', peak + 1, cap);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Not meant to be called directly (only via the trigger, which fires regardless
-- of caller EXECUTE privilege). Keep it off the anon/authenticated API surface —
-- Supabase's default privileges grant EXECUTE to those roles on new public
-- functions, so PUBLIC alone is not enough; revoke them explicitly too. This also
-- keeps it out of the SECURITY DEFINER advisor's sights.
REVOKE EXECUTE ON FUNCTION public.flag_session_over_capacity() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_flag_session_over_capacity ON public.schedule_sessions;
CREATE TRIGGER trg_flag_session_over_capacity
BEFORE INSERT OR UPDATE ON public.schedule_sessions
FOR EACH ROW
EXECUTE FUNCTION public.flag_session_over_capacity();
