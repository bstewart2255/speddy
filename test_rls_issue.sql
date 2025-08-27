-- Test RLS issue with profiles table
-- Run this in Supabase SQL Editor to debug the 500 errors

-- 1. Check current RLS policies on profiles table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 2. Check if any security definer functions exist
SELECT 
    proname as function_name,
    prosecdef as is_security_definer,
    pg_get_functiondef(oid) as definition
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
AND (proname LIKE '%school%' OR proname LIKE '%user%')
ORDER BY proname;

-- 3. Test a simple query as the problematic user
-- Replace with actual user ID from console logs
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims.sub TO '43241323-d9a7-4c88-99a9-e7b2633ba592';

-- This should trigger the same error as the app
SELECT role FROM profiles WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592';

-- 4. Check if there's a recursive issue
EXPLAIN (ANALYZE, BUFFERS) 
SELECT role FROM profiles WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592';

-- 5. Reset role
RESET role;