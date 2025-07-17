-- This migration verifies the profile and referral code setup
-- It doesn't create any new objects, just checks the existing setup

-- Check if profiles table exists and has the correct structure
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' 
                   AND table_name = 'profiles') THEN
        RAISE NOTICE 'WARNING: profiles table does not exist!';
    ELSE
        RAISE NOTICE 'OK: profiles table exists';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_schema = 'public' 
                   AND table_name = 'referral_codes') THEN
        RAISE NOTICE 'WARNING: referral_codes table does not exist!';
    ELSE
        RAISE NOTICE 'OK: referral_codes table exists';
    END IF;
END
$$;

-- Check if the referral code generation function exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_referral_code') THEN
        RAISE NOTICE 'WARNING: generate_referral_code function does not exist!';
    ELSE
        RAISE NOTICE 'OK: generate_referral_code function exists';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ensure_referral_code_for_teachers') THEN
        RAISE NOTICE 'WARNING: ensure_referral_code_for_teachers function does not exist!';
    ELSE
        RAISE NOTICE 'OK: ensure_referral_code_for_teachers function exists';
    END IF;
END
$$;

-- Check if the trigger exists on profiles table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger 
                   WHERE tgname = 'generate_referral_code_for_new_teacher' 
                   AND tgrelid = 'public.profiles'::regclass) THEN
        RAISE NOTICE 'WARNING: Referral code generation trigger does not exist on profiles table!';
    ELSE
        RAISE NOTICE 'OK: Referral code generation trigger exists on profiles table';
    END IF;
END
$$;

-- Test the referral code generation function
DO $$
DECLARE
    test_code TEXT;
BEGIN
    -- Test if the function generates valid codes
    test_code := generate_referral_code();
    
    IF LENGTH(test_code) = 6 AND test_code ~ '^[A-Z0-9]+$' THEN
        RAISE NOTICE 'OK: Referral code generation works correctly. Sample code: %', test_code;
    ELSE
        RAISE NOTICE 'ERROR: Referral code generation produced invalid code: %', test_code;
    END IF;
END
$$;

-- Summary message
DO $$
BEGIN
    RAISE NOTICE 'Profile and referral code setup verification complete. Check the messages above for any warnings.';
END
$$;