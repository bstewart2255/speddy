-- Investigation queries for school filtering issue
-- Run these queries in Supabase SQL editor to diagnose the problem

-- ========================================
-- RUN THIS FIRST - SUMMARY OF THE ISSUE
-- ========================================
WITH your_schools AS (
    SELECT DISTINCT school_id, s.name as school_name
    FROM (
        SELECT school_id FROM profiles WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
        UNION
        SELECT school_id FROM provider_schools WHERE provider_id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
    ) schools
    LEFT JOIN schools s ON s.id = schools.school_id
),
specialists_per_school AS (
    SELECT 
        ys.school_id,
        ys.school_name,
        COUNT(DISTINCT CASE WHEN p.role = 'sea' THEN p.id END) as sea_count,
        COUNT(DISTINCT CASE WHEN p.role = 'resource' AND p.id != '43241323-d9a7-4c88-99a9-e7b2633ba592' THEN p.id END) as other_rs_count,
        STRING_AGG(DISTINCT CASE WHEN p.role = 'sea' THEN p.full_name END, ', ' ORDER BY CASE WHEN p.role = 'sea' THEN p.full_name END) as sea_names,
        STRING_AGG(DISTINCT CASE WHEN p.role = 'resource' AND p.id != '43241323-d9a7-4c88-99a9-e7b2633ba592' THEN p.full_name END, ', ' ORDER BY CASE WHEN p.role = 'resource' AND p.id != '43241323-d9a7-4c88-99a9-e7b2633ba592' THEN p.full_name END) as rs_names
    FROM your_schools ys
    LEFT JOIN profiles p ON p.school_id = ys.school_id AND p.role IN ('sea', 'resource')
    GROUP BY ys.school_id, ys.school_name
)
SELECT 
    school_id,
    school_name,
    sea_count as "SEAs at this school",
    other_rs_count as "Other RS at this school",
    sea_names as "SEA names",
    rs_names as "RS names"
FROM specialists_per_school
ORDER BY school_name;

-- ========================================

-- QUICK START: Shows all your key information at once
-- User ID: 43241323-d9a7-4c88-99a9-e7b2633ba592
WITH user_info AS (
    SELECT 
        id, full_name, role, school_id, school_site, school_district, 
        works_at_multiple_schools
    FROM profiles 
    WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
),
user_all_schools AS (
    SELECT school_id, 'primary' as source FROM user_info WHERE school_id IS NOT NULL
    UNION
    SELECT school_id, 'additional' as source FROM provider_schools WHERE provider_id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
)
SELECT 
    'Your Profile' as category,
    ui.full_name as name,
    ui.role,
    ui.school_id as primary_school_id,
    ui.works_at_multiple_schools,
    (SELECT COUNT(*) FROM user_all_schools) as total_schools,
    (SELECT json_agg(json_build_object(
        'school_id', uas.school_id, 
        'source', uas.source,
        'school_name', s.name
    )) FROM user_all_schools uas
    LEFT JOIN schools s ON s.id = uas.school_id
    ) as all_your_schools
FROM user_info ui;

-- 1. Check your user profile and schools
SELECT 
    id,
    full_name,
    role,
    school_id,
    school_site,
    school_district,
    works_at_multiple_schools
FROM profiles 
WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592';

-- 2. Check all schools you work at (from provider_schools)
SELECT 
    ps.*,
    s.name as school_name
FROM provider_schools ps
LEFT JOIN schools s ON s.id = ps.school_id
WHERE ps.provider_id = '43241323-d9a7-4c88-99a9-e7b2633ba592';

-- 3. Check all Resource Specialists and SEAs at each of your schools
-- This shows what you SHOULD see when switching schools
WITH user_schools AS (
    -- Get all schools for the user
    SELECT DISTINCT school_id, 'primary' as source
    FROM profiles 
    WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
    
    UNION
    
    SELECT school_id, 'additional' as source
    FROM provider_schools
    WHERE provider_id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
)
SELECT 
    us.school_id,
    us.source as school_source,
    s.name as school_name,
    p.id,
    p.full_name,
    p.role,
    p.school_site,
    p.school_district
FROM user_schools us
LEFT JOIN schools s ON s.id = us.school_id
LEFT JOIN profiles p ON p.school_id = us.school_id
WHERE p.role IN ('resource', 'sea')
  AND p.id != '43241323-d9a7-4c88-99a9-e7b2633ba592'  -- Exclude yourself
ORDER BY us.school_id, p.role, p.full_name;

-- 4. Check what the RLS policy is actually returning
-- This simulates what the application sees
SELECT 
    p.id,
    p.full_name,
    p.role,
    p.school_id,
    p.school_site,
    p.school_district,
    CASE 
        WHEN p.school_id IN (
            SELECT school_id FROM profiles WHERE id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
            UNION
            SELECT school_id FROM provider_schools WHERE provider_id = '43241323-d9a7-4c88-99a9-e7b2633ba592'
        ) THEN 'VISIBLE'
        ELSE 'HIDDEN'
    END as visibility_status
FROM profiles p
WHERE p.role IN ('resource', 'sea')
  AND p.id != '43241323-d9a7-4c88-99a9-e7b2633ba592'
ORDER BY visibility_status DESC, p.school_id, p.role, p.full_name;

-- 5. Debug the actual function being used
-- Check if the security definer function is working correctly
-- NOTE: This function uses auth.uid() so you need to be logged in as user 43241323-d9a7-4c88-99a9-e7b2633ba592
SELECT * FROM public.get_user_school_ids();

-- 6. Check for any profiles with NULL or mismatched school_ids
SELECT 
    COUNT(*) as total_profiles,
    COUNT(school_id) as with_school_id,
    COUNT(*) - COUNT(school_id) as missing_school_id,
    COUNT(DISTINCT school_id) as unique_schools
FROM profiles
WHERE role IN ('resource', 'sea');

-- 7. Check if there are any data inconsistencies
-- Find profiles where school_id doesn't match school_site/district pattern
SELECT 
    p.id,
    p.full_name,
    p.role,
    p.school_id,
    p.school_site,
    p.school_district,
    s.name as school_name_from_id,
    s.city as school_city,
    s.district_id,
    d.name as district_name
FROM profiles p
LEFT JOIN schools s ON s.id = p.school_id
LEFT JOIN districts d ON d.id = s.district_id
WHERE p.role IN ('resource', 'sea')
  AND (
    p.school_id IS NULL
    OR s.id IS NULL  -- school_id doesn't exist in schools table
  );

-- 8. Test the specific query that the application is using
-- This simulates the exact query from use-schedule-data.ts
-- IMPORTANT: Replace 'CURRENT_SCHOOL_ID' with the school_id you're testing
-- You can get the school_ids from query 2 above
SELECT 
    id, 
    full_name, 
    supervising_provider_id
FROM profiles
WHERE role = 'sea'
  AND school_id = 'CURRENT_SCHOOL_ID'  -- <-- Replace this with actual school_id
ORDER BY full_name ASC;

-- 9. Check Resource Specialists at the current school
-- IMPORTANT: Replace 'CURRENT_SCHOOL_ID' with the school_id you're testing
SELECT 
    id, 
    full_name, 
    role
FROM profiles
WHERE role = 'resource'
  AND school_id = 'CURRENT_SCHOOL_ID'  -- <-- Replace this with actual school_id
  AND id != '43241323-d9a7-4c88-99a9-e7b2633ba592'
ORDER BY full_name ASC;

-- 10. Check if RLS is enabled and working
SELECT 
    schemaname,
    tablename,
    rowsecurity 
FROM pg_tables 
WHERE tablename = 'profiles';

-- 11. List all RLS policies on profiles table
SELECT 
    polname as policy_name,
    polcmd as command,
    pg_get_expr(polqual, polrelid) as using_expression,
    pg_get_expr(polwithcheck, polrelid) as with_check_expression
FROM pg_policy
WHERE polrelid = 'profiles'::regclass;