-- SPE-422: district-admin-managed curriculum list.
--
-- Replaces the per-user Settings checkbox list (profiles.selected_curriculums,
-- which nothing ever read) with one list per district. District admins curate
-- it from the master catalog (lib/curriculums/catalog.ts); the session/group
-- curriculum pickers show exactly the district's enabled entries.
--
-- Writes are NOT granted to browser sessions: the admin page mutates through
-- /api/admin/district/curriculums, which verifies the caller's district_admin
-- grant and writes with the service role — same shape as
-- district_sis_connections (SPE-395). Reads ARE browser-facing: every signed-in
-- user in the district needs the list to populate the session modal picker.

CREATE TABLE IF NOT EXISTS public.district_curriculums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- varchar(36), matching districts.id (see SPE-395's note: district ids are
  -- 36-char UUIDs; a narrower column rejects them before the FK is consulted).
  -- CASCADE: this is a pure child list with no independent life.
  district_id varchar(36) NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,
  -- Catalog id from lib/curriculums/catalog.ts (e.g. 'spire', 'wilson-reading').
  -- The catalog lives in app code, so the database cannot validate membership —
  -- the API route does — but the shape check keeps arbitrary text out even if a
  -- privileged writer bypasses the route.
  curriculum_id text NOT NULL CHECK (curriculum_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  -- Provenance, not a dependency (same reasoning as SPE-395): deleting the
  -- admin who enabled a curriculum must not fail on this FK.
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- One row per curriculum per district. Doubles as the district_id index —
  -- district-scoped lookups lead this key, so no separate index is needed.
  CONSTRAINT district_curriculums_district_curriculum_key UNIQUE (district_id, curriculum_id)
);

COMMENT ON TABLE public.district_curriculums IS
  'Curriculums a district has enabled for lesson planning (SPE-422). curriculum_id references lib/curriculums/catalog.ts. Read by every district member; written only via the district-admin API (service role).';

-- ---------------------------------------------------------------------------
-- Row-level policies
-- ---------------------------------------------------------------------------
ALTER TABLE public.district_curriculums ENABLE ROW LEVEL SECURITY;

-- Read: anyone in the district (providers populating their session picker),
-- plus district admins via their grant — district_admin profiles are
-- school-less and may predate profiles.district_id backfills, so the grant
-- branch keeps the admin page working regardless of profile shape.
-- No recursion risk: profiles' and admin_permissions' own policies never
-- reference this table (SPE-332 is the cautionary tale).
CREATE POLICY district_curriculums_select
ON public.district_curriculums
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM profiles p
    WHERE p.id = (SELECT auth.uid())
      AND p.district_id IS NOT NULL
      AND (p.district_id)::text = (district_curriculums.district_id)::text
  )
  OR EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role = 'district_admin'
      AND ap.district_id IS NOT NULL
      AND (ap.district_id)::text = (district_curriculums.district_id)::text
  )
);

-- Writes: browser sessions get nothing. Mutations run server-side through the
-- district-admin API route with the service role, which bypasses these.
CREATE POLICY district_curriculums_insert
ON public.district_curriculums
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY district_curriculums_update
ON public.district_curriculums
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY district_curriculums_delete
ON public.district_curriculums
FOR DELETE
TO authenticated
USING (false);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.district_curriculums FROM authenticated, anon;
GRANT SELECT ON public.district_curriculums TO authenticated;
