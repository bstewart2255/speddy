-- Remove unused referral code trigger
-- The referral_codes table was never created, causing user creation to fail.
-- Referral codes feature is not being used.

DROP TRIGGER IF EXISTS generate_referral_code_for_new_teacher ON public.profiles;

-- Also drop the function since it's no longer needed
DROP FUNCTION IF EXISTS ensure_referral_code_for_teachers();
