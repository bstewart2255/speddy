-- Migration: Add is_speddy_admin flag for internal admin portal
--
-- This enables Speddy team members to access /internal/* routes
-- and browse all states, districts, schools to onboard new customers.

-- Add is_speddy_admin flag to profiles table
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS is_speddy_admin BOOLEAN DEFAULT false;

-- Create partial index for efficient lookups (only indexes true values)
CREATE INDEX IF NOT EXISTS idx_profiles_is_speddy_admin
ON profiles(is_speddy_admin) WHERE is_speddy_admin = true;

-- Add comment
COMMENT ON COLUMN profiles.is_speddy_admin IS
'Flag indicating user is a Speddy internal admin with access to /internal/* routes';

-- NOTE: We do NOT add RLS policies for speddy admin access to states, districts, schools, or profiles.
--
-- 1. States, districts, and schools already have "Allow public read access" policies with USING (true),
--    so adding speddy admin policies would be redundant.
--
-- 2. Adding policies that query profiles.is_speddy_admin causes infinite recursion when combined with
--    existing policies like "District admins can view profiles in their district" which joins schools.
--    The chain: profiles -> schools -> profiles -> infinite loop.
--
-- 3. The create-admin API uses service role which bypasses RLS anyway.

-- Admin permissions: Allow speddy admins to insert admin_permissions records
CREATE POLICY "Speddy admins can create admin permissions"
ON public.admin_permissions FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_speddy_admin = true
  )
);
