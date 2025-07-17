-- One-time migration to generate referral codes for existing teacher accounts
-- This migration finds all teachers without referral codes and generates them

-- First, let's see how many teachers need codes
DO $$
DECLARE
    teacher_count INTEGER;
    codes_generated INTEGER := 0;
    errors_count INTEGER := 0;
BEGIN
    -- Count teachers without referral codes
    SELECT COUNT(*)
    INTO teacher_count
    FROM public.profiles p
    LEFT JOIN public.referral_codes rc ON rc.user_id = p.id
    WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist', 
                     'teacher', 'slp', 'psychologist', 'pt', 'behaviorist')
    AND rc.code IS NULL;

    RAISE NOTICE 'Found % teachers without referral codes', teacher_count;
END
$$;

-- Create a temporary function to generate codes for existing teachers
CREATE OR REPLACE FUNCTION backfill_referral_codes_for_teachers()
RETURNS TABLE(out_user_id UUID, out_email TEXT, out_role TEXT, out_code TEXT, out_status TEXT) AS $$
DECLARE
    teacher_record RECORD;
    new_code TEXT;
    attempts INTEGER;
    max_attempts INTEGER := 100;
    total_processed INTEGER := 0;
    total_success INTEGER := 0;
    total_errors INTEGER := 0;
BEGIN
    -- Process each teacher without a referral code
    FOR teacher_record IN 
        SELECT p.id, p.email, p.role
        FROM public.profiles p
        LEFT JOIN public.referral_codes rc ON rc.user_id = p.id
        WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                         'teacher', 'slp', 'psychologist', 'pt', 'behaviorist')
        AND rc.code IS NULL
        ORDER BY p.created_at
    LOOP
        total_processed := total_processed + 1;
        attempts := 0;
        new_code := NULL;
        
        -- Try to generate a unique code
        WHILE attempts < max_attempts AND new_code IS NULL LOOP
            attempts := attempts + 1;
            
            -- Generate a candidate code
            new_code := generate_referral_code();
            
            -- Check if it already exists
            IF EXISTS (SELECT 1 FROM public.referral_codes rc WHERE rc.code = new_code) THEN
                new_code := NULL; -- Try again
            END IF;
        END LOOP;
        
        -- If we got a unique code, insert it
        IF new_code IS NOT NULL THEN
            BEGIN
                INSERT INTO public.referral_codes (user_id, code, uses_count, created_at)
                VALUES (teacher_record.id, new_code, 0, NOW());
                
                total_success := total_success + 1;
                
                -- Return success record
                out_user_id := teacher_record.id;
                out_email := teacher_record.email;
                out_role := teacher_record.role;
                out_code := new_code;
                out_status := 'SUCCESS';
                RETURN NEXT;
                
            EXCEPTION WHEN OTHERS THEN
                total_errors := total_errors + 1;
                
                -- Return error record
                out_user_id := teacher_record.id;
                out_email := teacher_record.email;
                out_role := teacher_record.role;
                out_code := NULL;
                out_status := 'ERROR: ' || SQLERRM;
                RETURN NEXT;
            END;
        ELSE
            total_errors := total_errors + 1;
            
            -- Return failure record
            out_user_id := teacher_record.id;
            out_email := teacher_record.email;
            out_role := teacher_record.role;
            out_code := NULL;
            out_status := 'FAILED: Could not generate unique code after ' || max_attempts || ' attempts';
            RETURN NEXT;
        END IF;
    END LOOP;
    
    -- Log summary
    RAISE NOTICE 'Backfill complete. Processed: %, Success: %, Errors: %', 
                 total_processed, total_success, total_errors;
    
    RETURN;
END;
$$ LANGUAGE plpgsql;

-- Execute the backfill and show results
DO $$
DECLARE
    result_record RECORD;
    success_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting referral code backfill...';
    RAISE NOTICE '================================';
    
    -- Process all teachers and collect results
    FOR result_record IN SELECT * FROM backfill_referral_codes_for_teachers() LOOP
        IF result_record.out_status = 'SUCCESS' THEN
            success_count := success_count + 1;
            RAISE NOTICE 'Generated code % for user % (%)', 
                         result_record.out_code, 
                         result_record.out_email, 
                         result_record.out_role;
        ELSE
            error_count := error_count + 1;
            RAISE WARNING 'Failed for user % (%): %', 
                          result_record.out_email, 
                          result_record.out_role,
                          result_record.out_status;
        END IF;
    END LOOP;
    
    RAISE NOTICE '================================';
    RAISE NOTICE 'Backfill Summary:';
    RAISE NOTICE '  Successful: %', success_count;
    RAISE NOTICE '  Failed: %', error_count;
    RAISE NOTICE '  Total: %', success_count + error_count;
    
    -- Verify the results
    PERFORM COUNT(*)
    FROM public.profiles p
    INNER JOIN public.referral_codes rc ON rc.user_id = p.id
    WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                     'teacher', 'slp', 'psychologist', 'pt', 'behaviorist');
    
    RAISE NOTICE '================================';
    RAISE NOTICE 'Verification: % teachers now have referral codes', 
                 (SELECT COUNT(*)
                  FROM public.profiles p
                  INNER JOIN public.referral_codes rc ON rc.user_id = p.id
                  WHERE p.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist',
                                   'teacher', 'slp', 'psychologist', 'pt', 'behaviorist'));
END
$$;

-- Clean up the temporary function
DROP FUNCTION IF EXISTS backfill_referral_codes_for_teachers();

-- Add a comment about this migration
COMMENT ON TABLE public.referral_codes IS 
'Stores referral codes for teachers. Codes were automatically generated for new teachers via trigger, and existing teachers were backfilled via migration 20250117_backfill_referral_codes.sql';