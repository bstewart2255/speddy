-- Drop the existing trigger that generates referral codes for all users
DROP TRIGGER IF EXISTS generate_referral_code_for_new_user ON public.profiles;

-- Create an updated function that only generates referral codes for teacher roles
CREATE OR REPLACE FUNCTION ensure_referral_code_for_teachers()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
    attempts INTEGER := 0;
BEGIN
    -- Only generate referral codes for teacher roles (not SEA)
    IF NEW.role IN ('resource', 'speech', 'ot', 'counseling', 'specialist') THEN
        -- Try to generate a unique code
        LOOP
            new_code := generate_referral_code();
            
            -- Check if code already exists
            IF NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = new_code) THEN
                -- Insert the new code
                INSERT INTO public.referral_codes (user_id, code)
                VALUES (NEW.id, new_code);
                EXIT; -- Exit the loop
            END IF;
            
            attempts := attempts + 1;
            
            -- Prevent infinite loop
            IF attempts > 100 THEN
                RAISE EXCEPTION 'Unable to generate unique referral code';
            END IF;
        END LOOP;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to generate referral code only for new teacher profiles
CREATE TRIGGER generate_referral_code_for_new_teacher
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION ensure_referral_code_for_teachers();

-- Add a comment explaining the trigger's purpose
COMMENT ON TRIGGER generate_referral_code_for_new_teacher ON public.profiles IS 
'Automatically generates a unique 6-character referral code for new teacher profiles (resource, speech, ot, counseling, specialist roles). SEA roles do not get referral codes.';