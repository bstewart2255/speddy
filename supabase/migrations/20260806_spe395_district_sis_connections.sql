-- SPE-395: per-district SIS credential store, encrypted at rest.
--
-- Today the Aeries client is env-var-only — one global connection for the whole
-- platform. This gives each district its own stored connection, which is what
-- the tech portal (SPE-396 Aeries / SPE-397 OneRoster) and the exploration
-- tooling (SPE-398) both read.
--
-- ---------------------------------------------------------------------------
-- HOW CREDENTIALS ARE KEPT AWAY FROM CLIENTS
-- ---------------------------------------------------------------------------
-- RLS is ROW-level: it cannot hide a column. A policy that lets a district_tech
-- read "their" connection row lets them read every column of it, ciphertext
-- included. `calendar_connections` accepts that — its owner can select
-- `access_token_encrypted` — on the grounds that ciphertext without the key is
-- inert.
--
-- That is not good enough here. A district's Aeries certificate unlocks every
-- student record in the district, it is long-lived, and it would sit in a
-- browser's memory and network log on every page that reads connection status.
-- Ciphertext is a second line of defence, not a reason to hand it out.
--
-- So this table uses COLUMN-level grants on top of row-level RLS:
--
--   REVOKE SELECT ON district_sis_connections FROM authenticated;
--   GRANT  SELECT (<non-credential columns>) TO authenticated;
--
-- `authenticated` therefore cannot name a credential column at all — PostgREST
-- refuses with 42501 rather than returning it. The service role, which the API
-- routes use for the encrypt/decrypt paths, is unaffected (it bypasses both RLS
-- and column grants).
--
-- Consequence worth knowing: `select('*')` on this table FAILS for a browser
-- session, because `*` expands to columns it may not read. That is deliberate —
-- a loud, immediate error is a better failure mode than silently shipping a
-- certificate to the client because someone reached for the usual shorthand.
-- Callers must name the columns they want.
--
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.district_sis_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id varchar(20) NOT NULL REFERENCES public.districts(id),
  sis_type text NOT NULL CHECK (sis_type IN ('aeries', 'oneroster')),

  -- Connection config (non-secret).
  base_url text,
  token_url text,  -- OneRoster only

  -- Credentials. Ciphertext ONLY, produced by lib/sis/credential-crypto.ts
  -- (AES-256-GCM, `v1.<iv>.<ct>.<tag>`). There is deliberately no plaintext
  -- column to "temporarily" write to.
  aeries_certificate_encrypted text,
  oneroster_client_id_encrypted text,
  oneroster_client_secret_encrypted text,

  -- Last 4 of the credential, for display. The only part ever shown to a client.
  credential_hint text,

  -- Lifecycle. pending_dpa is the entry state: credential intake stays closed
  -- until a Speddy operator records the signed DPA.
  status text NOT NULL DEFAULT 'pending_dpa'
    CHECK (status IN ('pending_dpa', 'awaiting_credentials', 'testing',
                      'connected', 'error', 'disabled')),
  dpa_cleared_at timestamptz,

  last_tested_at timestamptz,
  last_test_result jsonb,

  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One connection per SIS per district.
  CONSTRAINT district_sis_connections_district_sis_key UNIQUE (district_id, sis_type),

  -- Credentials cannot exist before the DPA is recorded. Enforced here rather
  -- than only in the API, so the rule survives a future route that forgets it.
  CONSTRAINT district_sis_connections_no_credentials_before_dpa CHECK (
    dpa_cleared_at IS NOT NULL
    OR (aeries_certificate_encrypted IS NULL
        AND oneroster_client_id_encrypted IS NULL
        AND oneroster_client_secret_encrypted IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS district_sis_connections_district_idx
  ON public.district_sis_connections (district_id);

COMMENT ON TABLE public.district_sis_connections IS
  'Per-district SIS connection + app-layer-encrypted credentials (SPE-395). Credential columns are readable only by the service role — authenticated holds column-level SELECT on the non-secret columns only. Never add a plaintext credential column.';

-- ---------------------------------------------------------------------------
-- Row-level policies: scope a caller to their OWN district.
-- ---------------------------------------------------------------------------
ALTER TABLE public.district_sis_connections ENABLE ROW LEVEL SECURITY;

-- Read: the district's tech admin and its district admin(s). Writes are NOT
-- granted to browser sessions at all — every mutation runs server-side through
-- an API route, because every mutation involves crypto. Same reasoning as
-- provider_schools in SPE-399: this table is an integration control surface,
-- and "it's my district's row" is not a reason to let a browser write it.
CREATE POLICY district_sis_connections_select
ON public.district_sis_connections
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = (SELECT auth.uid())
      AND ap.role IN ('district_tech', 'district_admin')
      AND ap.district_id IS NOT NULL
      AND (ap.district_id)::text = (district_sis_connections.district_id)::text
  )
);

CREATE POLICY district_sis_connections_insert
ON public.district_sis_connections
FOR INSERT
TO authenticated
WITH CHECK (false);

CREATE POLICY district_sis_connections_update
ON public.district_sis_connections
FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);

CREATE POLICY district_sis_connections_delete
ON public.district_sis_connections
FOR DELETE
TO authenticated
USING (false);

-- ---------------------------------------------------------------------------
-- Column-level grants: the part that actually hides the credentials.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.district_sis_connections FROM authenticated, anon;

GRANT SELECT (
  id,
  district_id,
  sis_type,
  base_url,
  token_url,
  credential_hint,
  status,
  dpa_cleared_at,
  last_tested_at,
  last_test_result,
  created_by,
  created_at,
  updated_at
) ON public.district_sis_connections TO authenticated;

-- anon gets nothing at all: this table has no logged-out surface.
