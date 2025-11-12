-- Fix admin_permissions RLS policies to not block legitimate reads
-- Issue: The "Only super admins can manage permissions" policy with USING (false)
-- may be interfering with authentication even though it should be OR'd with other policies

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Only super admins can manage permissions" ON public.admin_permissions;

-- Replace with more specific policies for INSERT/UPDATE/DELETE only
-- (SELECT already has its own policy and doesn't need this restriction)

CREATE POLICY "Only service role can insert admin permissions"
ON public.admin_permissions FOR INSERT
TO authenticated
WITH CHECK (false);  -- Block all inserts via authenticated users (use service role)

CREATE POLICY "Only service role can update admin permissions"
ON public.admin_permissions FOR UPDATE
TO authenticated
USING (false)
WITH CHECK (false);  -- Block all updates via authenticated users (use service role)

CREATE POLICY "Only service role can delete admin permissions"
ON public.admin_permissions FOR DELETE
TO authenticated
USING (false);  -- Block all deletes via authenticated users (use service role)

COMMENT ON POLICY "Only service role can insert admin permissions" ON public.admin_permissions
IS 'Admin permissions can only be granted via service role or SQL, not by authenticated users';

COMMENT ON POLICY "Only service role can update admin permissions" ON public.admin_permissions
IS 'Admin permissions can only be modified via service role or SQL, not by authenticated users';

COMMENT ON POLICY "Only service role can delete admin permissions" ON public.admin_permissions
IS 'Admin permissions can only be revoked via service role or SQL, not by authenticated users';
