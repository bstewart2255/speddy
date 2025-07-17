-- Verification script to check the status of referral codes after backfill
-- This can be run independently to verify the migration results

-- Summary statistics
DO $$
DECLARE
    total_teachers INTEGER;
    teachers_with_codes INTEGER;
    teachers_without_codes INTEGER;
    sea_count INTEGER;
    duplicate_codes INTEGER;
BEGIN
    -- Count total teachers
    SELECT COUNT(*)
    INTO total_teachers
    FROM public.profiles
    WHERE role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                   'teacher', 'slp', 'psychologist', 'pt', 'behaviorist');
    
    -- Count teachers with referral codes
    SELECT COUNT(*)
    INTO teachers_with_codes
    FROM public.profiles p
    INNER JOIN public.referral_codes rc ON rc.user_id = p.id
    WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                     'teacher', 'slp', 'psychologist', 'pt', 'behaviorist');
    
    -- Count teachers without referral codes
    SELECT COUNT(*)
    INTO teachers_without_codes
    FROM public.profiles p
    LEFT JOIN public.referral_codes rc ON rc.user_id = p.id
    WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                     'teacher', 'slp', 'psychologist', 'pt', 'behaviorist')
    AND rc.code IS NULL;
    
    -- Count SEA users (should have no codes)
    SELECT COUNT(*)
    INTO sea_count
    FROM public.profiles
    WHERE role = 'sea';
    
    -- Check for duplicate codes
    SELECT COUNT(*)
    INTO duplicate_codes
    FROM (
        SELECT code, COUNT(*) as count
        FROM public.referral_codes
        GROUP BY code
        HAVING COUNT(*) > 1
    ) duplicates;
    
    RAISE NOTICE '=== REFERRAL CODE VERIFICATION REPORT ===';
    RAISE NOTICE 'Total teachers: %', total_teachers;
    RAISE NOTICE 'Teachers with referral codes: %', teachers_with_codes;
    RAISE NOTICE 'Teachers WITHOUT referral codes: %', teachers_without_codes;
    RAISE NOTICE 'SEA users (no codes expected): %', sea_count;
    RAISE NOTICE 'Duplicate codes found: %', duplicate_codes;
    RAISE NOTICE '';
    
    IF teachers_without_codes = 0 AND duplicate_codes = 0 THEN
        RAISE NOTICE '✅ SUCCESS: All teachers have unique referral codes!';
    ELSE
        IF teachers_without_codes > 0 THEN
            RAISE WARNING '❌ ISSUE: % teachers still need referral codes', teachers_without_codes;
        END IF;
        IF duplicate_codes > 0 THEN
            RAISE WARNING '❌ ISSUE: % duplicate codes found', duplicate_codes;
        END IF;
    END IF;
END
$$;

-- List teachers without codes (if any)
DO $$
DECLARE
    missing_record RECORD;
    count INTEGER := 0;
BEGIN
    FOR missing_record IN 
        SELECT p.id, p.email, p.role, p.created_at
        FROM public.profiles p
        LEFT JOIN public.referral_codes rc ON rc.user_id = p.id
        WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                         'teacher', 'slp', 'psychologist', 'pt', 'behaviorist')
        AND rc.code IS NULL
        ORDER BY p.created_at
        LIMIT 10
    LOOP
        IF count = 0 THEN
            RAISE NOTICE '';
            RAISE NOTICE '=== TEACHERS WITHOUT CODES (max 10) ===';
        END IF;
        count := count + 1;
        RAISE NOTICE '% - % (%) - Created: %', 
                     count, 
                     missing_record.email, 
                     missing_record.role,
                     missing_record.created_at::date;
    END LOOP;
END
$$;

-- Check for any SEA users with codes (shouldn't happen)
DO $$
DECLARE
    sea_with_code RECORD;
    count INTEGER := 0;
BEGIN
    FOR sea_with_code IN 
        SELECT p.id, p.email, rc.code
        FROM public.profiles p
        INNER JOIN public.referral_codes rc ON rc.user_id = p.id
        WHERE p.role = 'sea'
        LIMIT 10
    LOOP
        IF count = 0 THEN
            RAISE NOTICE '';
            RAISE WARNING '=== SEA USERS WITH CODES (UNEXPECTED) ===';
        END IF;
        count := count + 1;
        RAISE WARNING '% - % has code: %', 
                      count, 
                      sea_with_code.email, 
                      sea_with_code.code;
    END LOOP;
END
$$;

-- Show duplicate codes (if any)
DO $$
DECLARE
    dup_record RECORD;
    count INTEGER := 0;
BEGIN
    FOR dup_record IN 
        SELECT rc.code, COUNT(*) as usage_count, 
               string_agg(p.email, ', ' ORDER BY p.email) as emails
        FROM public.referral_codes rc
        INNER JOIN public.profiles p ON p.id = rc.user_id
        GROUP BY rc.code
        HAVING COUNT(*) > 1
        LIMIT 10
    LOOP
        IF count = 0 THEN
            RAISE NOTICE '';
            RAISE WARNING '=== DUPLICATE CODES (max 10) ===';
        END IF;
        count := count + 1;
        RAISE WARNING 'Code % used % times by: %', 
                      dup_record.code, 
                      dup_record.usage_count,
                      dup_record.emails;
    END LOOP;
END
$$;

-- Show sample of generated codes
DO $$
DECLARE
    sample_record RECORD;
    count INTEGER := 0;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== SAMPLE GENERATED CODES ===';
    
    FOR sample_record IN 
        SELECT p.email, p.role, rc.code, rc.created_at
        FROM public.profiles p
        INNER JOIN public.referral_codes rc ON rc.user_id = p.id
        WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                         'teacher', 'slp', 'psychologist', 'pt', 'behaviorist')
        ORDER BY rc.created_at DESC
        LIMIT 5
    LOOP
        count := count + 1;
        RAISE NOTICE '% - % (%) - Code: % - Generated: %', 
                     count, 
                     sample_record.email, 
                     sample_record.role,
                     sample_record.code,
                     sample_record.created_at::timestamp(0);
    END LOOP;
END
$$;