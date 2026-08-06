-- SPE-393: District Tech Admin role foundation.
--
-- Adds the 12th profile role, `district_tech` ("District Tech Admin"), a
-- district-scoped role whose entire surface is the integrations/credentials
-- portal at /dashboard/tech. It gets NO access to students, sessions, CARE,
-- chat, or scheduling.
--
-- Deliberately NOT in this migration: any new RLS grant on a domain table.
-- The role's district scope rides the existing admin_permissions mechanism,
-- and every policy that consults admin_permissions constrains ap.role to
-- 'site_admin'/'district_admin' explicitly, so a `district_tech` grant row
-- matches none of them. That was verified against the live policy set rather
-- than inferred from the migration history.

-- ---------------------------------------------------------------------------
-- 1. profiles.role — allow the new value
--    (pattern: 20260410_add_intervention_role.sql)
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role = ANY (ARRAY[
      'resource'::text, 'speech'::text, 'ot'::text, 'counseling'::text,
      'specialist'::text, 'sea'::text, 'teacher'::text, 'site_admin'::text,
      'district_admin'::text, 'psychologist'::text, 'intervention'::text,
      'district_tech'::text
    ])
  );

COMMENT ON CONSTRAINT profiles_role_check ON public.profiles
IS 'Valid profile roles. district_tech (SPE-393) is district-scoped and sees only the integrations portal.';

-- ---------------------------------------------------------------------------
-- 2. admin_permissions — accept district_tech as a scope grant
--
-- Two separate CHECKs guard this table: one enumerating the allowed roles,
-- one pairing each role with the scope column it requires. Both must learn
-- the new role, or the insert fails on whichever is missed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.admin_permissions
  DROP CONSTRAINT admin_permissions_role_check;

ALTER TABLE public.admin_permissions
  ADD CONSTRAINT admin_permissions_role_check CHECK (
    role = ANY (ARRAY['site_admin'::text, 'district_admin'::text, 'district_tech'::text])
  );

ALTER TABLE public.admin_permissions
  DROP CONSTRAINT admin_permissions_check;

ALTER TABLE public.admin_permissions
  ADD CONSTRAINT admin_permissions_check CHECK (
    -- Site admin must have school_id
    (role = 'site_admin' AND school_id IS NOT NULL) OR
    -- District admin must have district_id
    (role = 'district_admin' AND district_id IS NOT NULL) OR
    -- District tech admin is district-scoped, same as a district admin
    (role = 'district_tech' AND district_id IS NOT NULL)
  );

COMMENT ON TABLE public.admin_permissions
IS 'Tracks which schools/districts each site_admin, district_admin and district_tech can manage';

-- ---------------------------------------------------------------------------
-- 3. is_chat_eligible — the one role check in the schema that is a DENY-list
--
-- Every other role gate is an allow-list, so a new role is excluded by simply
-- not being named. This one is inverted: `role NOT IN ('sea','district_admin')`
-- means an unnamed role is eligible BY DEFAULT. Left alone, district_tech would
-- be able to open direct conversations with staff through the chat RLS
-- policies, which all funnel through this function — the middleware bounce off
-- /dashboard/chat hides the UI but does nothing about the data layer.
--
-- Definition otherwise preserved verbatim (sql, STABLE, SECURITY DEFINER,
-- pinned search_path) from 20260627_chat_direct_messages.sql.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_chat_eligible(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid AND p.role NOT IN ('sea', 'district_admin', 'district_tech')
  );
$function$;

COMMENT ON FUNCTION public.is_chat_eligible(uuid)
IS 'Chat participation gate. DENY-list: any role not named here is eligible by default — add new non-chat roles explicitly.';
