-- SPE-570: backfill profiles.district_id / profiles.state_id for accounts that
-- were created with a school but no district.
--
-- HOW THEY GOT THIS WAY. `create_profile_for_new_user` resolves the structured
-- ids by fuzzy NAME matching (`find_school_ids_by_names`), whose district
-- lookup is gated on a non-empty state AND district name. Every admin/SIS
-- creation path passes `state: ''` and `school_district: ''`, so the matcher
-- returns NULL for all three ids and each caller pins them afterwards. Four
-- callers pinned only `school_id` (fixed in this PR):
--   lib/sis/teacher-directory-sync.ts        - SIS teacher sync
--   app/api/admin/district/teachers/         - district admin creates a teacher
--   app/api/admin/create-teacher-account/    - site admin creates a teacher
--   app/api/admin/district/site-admin/       - district admin creates a site admin
--
-- Scope verified against prod on 2026-08-19: 114 rows have a school_id but no
-- district_id (110 teacher, 4 site_admin), spread across John Swett Unified,
-- Mt. Diablo Unified and Hayward Unified. Every one of those school_ids
-- resolves in `schools` — zero orphaned FKs — so the district is unambiguous.
-- Independently checked: NO profile anywhere disagrees with its school's
-- district (0 rows where district_id <> schools.district_id), so this fills
-- blanks only and can never overwrite a conflicting value.
--
-- One extra row is included: a site_admin carrying a correct district_id but a
-- NULL state_id. Same blank, one step further along.
--
-- State comes from `districts.state_id`, not from the creating admin's grant.
-- `admin_permissions.state_id` is not normalized — production holds both 'CA'
-- and 'ca' — while every profiles.state_id in use today is 'CA', matching the
-- reference table. Deriving from `districts` keeps that consistent.
--
-- Two accounts are deliberately NOT touched: `marsb@mdusd.org` and
-- `help@speddy.xyz` have no school_id either, so nothing is derivable for them.
-- Both are legacy test/support accounts.
--
-- DOES THIS CHANGE WHAT ANYONE CAN SEE? No — checked, not assumed, because
-- SPE-514 is the cautionary tale of a backfill that was correct as
-- normalization and wrong as a shipped change.
--
--   * `profiles_select`'s district-admin branch matches on `school_id`; its
--     `district_id` branch is gated on `school_id IS NULL` and exists only for
--     school-less roles. Every row here has a school, so RLS is unmoved.
--   * The district-scoped app queries resolve school ids from `schools` first
--     and filter profiles by school (`getDistrictStaffCounts`), or OR the two
--     (`setup-guide.ts`), and the latter is restricted to specialist roles —
--     which teacher and site_admin are not.
--   * `care_case_status_history`'s SELECT policy DOES contain a branch keyed on
--     the caller's `profiles.district_id`, which reads as though it would hand
--     110 teachers district-wide CARE visibility. It does not: that branch sits
--     inside an EXISTS over `care_cases`/`care_referrals`, whose own RLS is
--     evaluated for the caller and does not grant teachers district-wide access,
--     so the predicate never gets a row to match. Confirmed with real signed-in
--     sessions against the sim district, where teachers already carry
--     district_id: a teacher with ZERO students (no other route to any CARE row)
--     reads 0 of the 6 status-history rows in their own district, while a
--     provider reads 3 and the district admin reads 6. No other CARE policy has
--     a `profiles.district_id` branch at all.

BEGIN;

-- Recovery record: the exact rows changed, with their prior values, so this is
-- precisely reversible even after later writes land on these profiles.
CREATE TABLE IF NOT EXISTS public.backup_spe570_profile_scope_backfill (
  profile_id           uuid        NOT NULL PRIMARY KEY,
  previous_district_id varchar,
  previous_state_id    varchar,
  backfilled_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.backup_spe570_profile_scope_backfill IS
  'SPE-570 recovery record: profiles whose NULL district_id/state_id were backfilled from schools/districts on 2026-08-19. Reverse by setting district_id = previous_district_id and state_id = previous_state_id for these ids. Safe to drop once the fix has held.';

-- No RLS policies: service-role / migration access only. Not exposed to clients.
ALTER TABLE public.backup_spe570_profile_scope_backfill ENABLE ROW LEVEL SECURITY;

INSERT INTO public.backup_spe570_profile_scope_backfill (profile_id, previous_district_id, previous_state_id)
SELECT p.id, p.district_id, p.state_id
FROM public.profiles p
WHERE (p.district_id IS NULL AND p.school_id IS NOT NULL)
   OR (p.state_id IS NULL AND p.district_id IS NOT NULL)
ON CONFLICT (profile_id) DO NOTHING;

-- 1. Rows with a school but no district: take both ids from the school's district.
UPDATE public.profiles p
SET district_id = s.district_id,
    state_id    = COALESCE(p.state_id, d.state_id)
FROM public.schools s
JOIN public.districts d ON d.id = s.district_id
WHERE s.id = p.school_id
  AND p.district_id IS NULL;

-- 2. Rows that already had the right district but no state.
UPDATE public.profiles p
SET state_id = d.state_id
FROM public.districts d
WHERE d.id = p.district_id
  AND p.state_id IS NULL;

-- Guard: fail the whole transaction if any derivable blank survived.
DO $$
DECLARE
  missing_district bigint;
  missing_state    bigint;
BEGIN
  SELECT count(*) INTO missing_district
  FROM public.profiles p
  JOIN public.schools s ON s.id = p.school_id
  WHERE p.district_id IS NULL;

  SELECT count(*) INTO missing_state
  FROM public.profiles p
  JOIN public.districts d ON d.id = p.district_id
  WHERE p.state_id IS NULL;

  IF missing_district <> 0 OR missing_state <> 0 THEN
    RAISE EXCEPTION
      'SPE-570: backfill incomplete - % profiles still missing a derivable district, % still missing a derivable state; rolling back',
      missing_district, missing_state;
  END IF;
END $$;

COMMIT;
