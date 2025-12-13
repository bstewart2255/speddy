-- Fix infinite recursion in RLS policies
--
-- The "Speddy admins can view all X" policies caused infinite recursion because:
-- 1. Reading profiles triggers "District admins can view profiles in their district" which joins schools
-- 2. Reading schools triggers "Speddy admins can view all schools" which queries profiles
-- 3. This creates an infinite loop: profiles -> schools -> profiles
--
-- Solution: Remove all "Speddy admins can view all X" policies.
-- These are redundant anyway since states, districts, and schools already have
-- "Allow public read access" policies with USING (true).
-- The create-admin API uses service role which bypasses RLS.

DROP POLICY IF EXISTS "Speddy admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Speddy admins can view all states" ON public.states;
DROP POLICY IF EXISTS "Speddy admins can view all districts" ON public.districts;
DROP POLICY IF EXISTS "Speddy admins can view all schools" ON public.schools;
