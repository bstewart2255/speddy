-- SPE-394: let a district admin see the district-scoped staff in their own
-- district — including the District Tech Admin they just created.
--
-- THE GAP. `profiles_select`'s district-admin branch matches staff by SCHOOL:
--
--   EXISTS (SELECT 1 FROM admin_permissions ap
--             JOIN schools s ON s.district_id = ap.district_id
--            WHERE ap.admin_id = auth.uid()
--              AND ap.role = 'district_admin'
--              AND s.id = profiles.school_id)
--
-- `district_tech` has `school_id IS NULL` by design, so `s.id = NULL` never
-- matches and the account is invisible to the very admin who created it.
-- Verified against live RLS before writing this: Dana (sim district admin) read
-- 0 rows for Theo (district_tech, same district), while the control — a
-- school-based teacher in that district — returned 1 row.
--
-- The same blind spot already applies to `district_admin` profiles, which are
-- equally school-less; district admins cannot see each other today.
--
-- THE FIX. Add a branch that matches on the DISTRICT the caller administers,
-- alongside the existing school branch rather than replacing it:
--
--   ap.role = 'district_admin' AND ap.district_id = profiles.district_id
--
-- Scope of the widening (owner-approved): a district admin additionally sees
-- profiles in their OWN district that carry no school. Nothing crosses district
-- lines — the predicate is pinned to the caller's own grant rows, and a NULL
-- district_id on either side does not match.
--
-- No recursion risk: the new branch reads `admin_permissions`, not `profiles`.
-- That is the same table the existing branches already consult, so this adds no
-- new policy edge. (SPE-332 is the cautionary tale — `profiles_update` was
-- recursive and silently broke every self-serve profile write for ~7 months.)
--
-- Everything else in the policy is carried over verbatim: self-read, the
-- school-ids union, providers-at-my-schools, the original district-admin school
-- branch, and the site-admin branch.

DROP POLICY IF EXISTS profiles_select ON public.profiles;

-- TO authenticated, NOT public. 20260531_scope_public_select_policies_to_authenticated.sql
-- deliberately narrowed this policy to `authenticated`; a DROP + CREATE without
-- restating that silently reverts the hardening, because CREATE POLICY defaults
-- to `public`. Caught in review (Codex, PR #805) after exactly that happened —
-- the live policy had gone back to {public}.
CREATE POLICY profiles_select
ON public.profiles
FOR SELECT
TO authenticated
USING (
  -- own row
  (id = (SELECT auth.uid()))

  -- anyone at a school I'm scoped to
  OR ((school_id)::text IN (
        SELECT get_my_school_ids.school_id
        FROM get_my_school_ids() get_my_school_ids(school_id)))

  -- providers serving my schools
  OR (id IN (
        SELECT get_providers_at_my_schools.provider_id
        FROM get_providers_at_my_schools() get_providers_at_my_schools(provider_id)))

  -- district admin: anyone at a school in a district I administer
  OR (EXISTS (
        SELECT 1
        FROM admin_permissions ap
          JOIN schools s ON ((s.district_id)::text = (ap.district_id)::text)
        WHERE ap.admin_id = (SELECT auth.uid())
          AND ap.role = 'district_admin'
          AND (s.id)::text = (profiles.school_id)::text))

  -- district admin: district-scoped staff in a district I administer (SPE-394).
  -- This is the branch that school-less roles — district_tech, and fellow
  -- district admins — fall through to.
  OR (EXISTS (
        SELECT 1
        FROM admin_permissions ap
        WHERE ap.admin_id = (SELECT auth.uid())
          AND ap.role = 'district_admin'
          AND ap.district_id IS NOT NULL
          AND (ap.district_id)::text = (profiles.district_id)::text
          -- school-less only. Staff WITH a school in this district are already
          -- covered by the branch above, so without this the branch would also
          -- match a profile whose district_id says one district while its
          -- school_id points at another's school — inconsistent data nobody
          -- should be granted sight of. Keeps the policy equal to its stated
          -- intent rather than merely a superset of it. (CodeRabbit, PR #805.)
          AND profiles.school_id IS NULL))

  -- site admin: my school, or a provider serving my school
  OR (EXISTS (
        SELECT 1
        FROM admin_permissions ap
        WHERE ap.admin_id = (SELECT auth.uid())
          AND ap.role = 'site_admin'
          AND (((ap.school_id)::text = (profiles.school_id)::text)
               OR (EXISTS (
                     SELECT 1
                     FROM provider_schools ps
                     WHERE ps.provider_id = profiles.id
                       AND (ps.school_id)::text = (ap.school_id)::text)))))
);
