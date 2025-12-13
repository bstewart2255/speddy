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

-- RLS Policies for Speddy Admin access to reference tables
-- These allow speddy admins to browse all states, districts, and schools

-- States: Allow speddy admins to view all states
CREATE POLICY "Speddy admins can view all states"
ON public.states FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_speddy_admin = true
  )
);

-- Districts: Allow speddy admins to view all districts
CREATE POLICY "Speddy admins can view all districts"
ON public.districts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_speddy_admin = true
  )
);

-- Schools: Allow speddy admins to view all schools
CREATE POLICY "Speddy admins can view all schools"
ON public.schools FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.is_speddy_admin = true
  )
);

-- Profiles: Allow speddy admins to view all profiles (for lookup during admin creation)
CREATE POLICY "Speddy admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
    AND p.is_speddy_admin = true
  )
);

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
