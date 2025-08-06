-- Drop the unsafe generic increment function
DROP FUNCTION IF EXISTS increment(text, text, uuid);

-- Create a specific, secure function for incrementing referral code usage
CREATE OR REPLACE FUNCTION increment_referral_uses(referrer_user_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE referral_codes 
  SET uses_count = uses_count + 1
  WHERE user_id = referrer_user_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referral code not found for user %', referrer_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION increment_referral_uses(uuid) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION increment_referral_uses(uuid) IS 'Safely increments the uses_count for a referral code by user_id';