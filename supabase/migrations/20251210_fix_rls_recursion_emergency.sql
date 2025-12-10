-- EMERGENCY FIX: Resolve infinite recursion in profiles/provider_schools RLS policies
--
-- Root cause: provider_schools RLS policy queries profiles table, which triggers
-- profiles RLS, which calls user_accessible_school_ids(), which queries provider_schools,
-- creating an infinite loop.
--
-- This migration:
-- 1. Simplifies provider_schools RLS to only check provider_id (no profiles query)
-- 2. Reverts profiles RLS to simple self-only policy (stops recursion)
--
-- After this, we can add back school-based visibility with a non-recursive approach.

-- STEP 1: Fix provider_schools RLS to NOT query profiles
DROP POLICY IF EXISTS "Users can view provider_schools for accessible schools" ON provider_schools;

CREATE POLICY "Users can view provider_schools for accessible schools" ON provider_schools
  FOR SELECT
  USING (provider_id = auth.uid());

-- STEP 2: Revert profiles to simple policy (stops errors immediately)
DROP POLICY IF EXISTS profiles_select_users ON public.profiles;

CREATE POLICY profiles_select_users ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- Add comments
COMMENT ON POLICY "Users can view provider_schools for accessible schools" ON provider_schools IS
'Simplified policy - users can only view their own provider_schools records. Avoids recursion with profiles table.';

COMMENT ON POLICY profiles_select_users ON public.profiles IS
'Emergency simplified policy - users can only view their own profile. Prevents infinite recursion.';
