-- SPE-363: five providers carry is_primary = true on two provider_schools rows,
-- and nothing prevents it.
--
-- WHAT THE DATA ACTUALLY SHOWS (checked before writing; the ticket's diagnosis
-- was wrong on both counts, so the fix here is narrower than it proposed)
--
-- The ticket read this as "two SCHOOLS both wear the Primary badge… the login
-- fallback picks whichever the sort left first — effectively arbitrary". It is
-- not. Resolving every row to a canonical school (school_id when present, else
-- schools.id matched on school_site, else the site name itself):
--
--   provider   raw_rows  distinct_schools  primary_rows  DISTINCT_PRIMARY_SCHOOLS
--   10605f5c      4            3                2                  1
--   3c1f3c98      2            1                2                  1
--   49c8b015      3            2                2                  1
--   d9e10af0      2            1                2                  1
--   f5f8809d      3            2                2                  1
--
-- distinct_primary_schools is 1 for every one of them: both "primary" rows point
-- at the SAME school, stored twice — once as a legacy row (school_id IS NULL,
-- carrying only school_site) and once as its normalized twin. So the login
-- ladder was never picking arbitrarily; either row resolves to the same school.
-- The user-visible symptom is a duplicated entry in the switcher, not a wrong
-- school.
--
-- The ticket's second claim — "2 providers have two provider_schools rows but
-- works_at_multiple_schools = false, so those users only ever see one of their
-- two schools" — is backwards. Those two (3c1f3c98, d9e10af0) resolve to exactly
-- ONE distinct school, so `false` is correct. All five flags are correct as they
-- stand, and this migration deliberately does NOT touch
-- works_at_multiple_schools. Setting it from raw row count, as the ticket
-- proposed, would have flagged two single-school providers as itinerant.
--
-- WHAT THIS DOES
--
-- 1. Clears is_primary on the duplicate, keeping the row whose school_id matches
--    profiles.school_id — the normalized one, in all five cases (verified: each
--    provider has exactly one such row, so there is no judgment call).
--    IS DISTINCT FROM, not <>, because the losing rows have school_id IS NULL and
--    a plain inequality is NULL there — it would have matched nothing and this
--    migration would have silently done nothing at all.
--
-- 2. Adds the partial unique index so a second primary cannot recur. The table's
--    only uniqueness today is (provider_id, school_district, school_site), and
--    the 20260410 backfill wrote school_district = '' while legacy rows carry the
--    real district text, so that constraint never saw these as duplicates.
--
-- NOT DONE HERE: deleting the duplicate legacy rows themselves. That is what
-- would stop the switcher showing one school twice, but it is row deletion driven
-- by name matching across an un-normalized column, which is exactly SPE-54's job
-- (school_site/school_district -> school_id/district_id). Filed separately rather
-- than smuggled into a flag fix.

BEGIN;

-- 1. Collapse to a single primary per provider.
UPDATE public.provider_schools ps
SET is_primary = false
FROM public.profiles p
WHERE p.id = ps.provider_id
  AND ps.is_primary IS TRUE
  AND ps.school_id IS DISTINCT FROM p.school_id
  AND ps.provider_id IN (
    SELECT provider_id
    FROM public.provider_schools
    GROUP BY provider_id
    HAVING count(*) FILTER (WHERE is_primary) > 1
  );

-- 2. Fail loudly rather than half-apply, in BOTH directions.
--
--    Too many is the obvious check: if a provider still has two primaries the
--    keep-rule did not cover some shape, and the index below would fail with a
--    far less legible error.
--
--    Too few matters just as much and is easier to miss — the deep self-review
--    caught this guard checking only `> 1`. The keep-rule preserves the row whose
--    school_id equals profiles.school_id; if a provider's duplicate primaries BOTH
--    differ from it (both legacy/NULL, say), the UPDATE strips every one and the
--    provider is left with no primary at all. Production held no such shape, but a
--    replay against another snapshot is not protected by a one-sided guard, and
--    silently stripping a primary is worse than the duplicate it replaced.
DO $$
DECLARE
  v_multi integer;
  v_none  integer;
BEGIN
  SELECT count(*) INTO v_multi FROM (
    SELECT provider_id FROM public.provider_schools
    GROUP BY provider_id HAVING count(*) FILTER (WHERE is_primary) > 1
  ) x;
  IF v_multi > 0 THEN
    RAISE EXCEPTION
      'SPE-363: % provider(s) still hold multiple primary schools after the collapse', v_multi;
  END IF;

  SELECT count(*) INTO v_none FROM (
    SELECT provider_id FROM public.provider_schools
    GROUP BY provider_id HAVING count(*) FILTER (WHERE is_primary) = 0
  ) x;
  IF v_none > 0 THEN
    RAISE EXCEPTION
      'SPE-363: % provider(s) were left with NO primary school — the keep-rule (school_id = profiles.school_id) matched none of their rows', v_none;
  END IF;
END $$;

-- 3. Prevent recurrence. Partial unique index: at most one primary row per
--    provider, with no constraint on how many non-primary rows they hold.
--    is_primary is nullable (DEFAULT false); WHERE is_primary treats NULL as
--    false, so null-flagged rows are simply not indexed, which is what we want.
--    Not CONCURRENTLY: it cannot run inside a transaction, and the failure mode
--    of trying is the dead 20250813 migration in SPE-502. The table is ~80 rows.
CREATE UNIQUE INDEX IF NOT EXISTS provider_schools_one_primary_per_provider
  ON public.provider_schools (provider_id)
  WHERE is_primary;

COMMENT ON INDEX public.provider_schools_one_primary_per_provider IS
  'SPE-363: a provider may flag at most one school primary. The 20260410 backfill guarded on (provider_id, school_id) rather than per provider, and the table''s only unique constraint compares school_district, which that backfill wrote as '''' — so five providers ended up with two primary rows for the same school.';

COMMIT;
