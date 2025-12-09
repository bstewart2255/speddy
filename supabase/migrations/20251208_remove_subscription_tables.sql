-- Remove subscription/payment system tables and related objects
-- This migration removes the B2C subscription infrastructure as we pivot to B2B school district model

-- Drop trigger first (on profiles table)
DROP TRIGGER IF EXISTS ensure_referral_code_trigger ON profiles;

-- Drop the function that creates referral codes
DROP FUNCTION IF EXISTS ensure_referral_code();

-- Drop tables in order of dependencies
-- 1. referral_relationships references subscriptions
DROP TABLE IF EXISTS referral_relationships CASCADE;

-- 2. subscription_pauses references subscriptions
DROP TABLE IF EXISTS subscription_pauses CASCADE;

-- 3. referral_credits (no dependencies on subscription tables)
DROP TABLE IF EXISTS referral_credits CASCADE;

-- 4. subscriptions (now safe to drop)
DROP TABLE IF EXISTS subscriptions CASCADE;

-- 5. referral_codes (standalone)
DROP TABLE IF EXISTS referral_codes CASCADE;

-- Clean up any related indexes that might remain
DROP INDEX IF EXISTS idx_subscriptions_user_id;
DROP INDEX IF EXISTS idx_subscriptions_stripe_customer_id;
DROP INDEX IF EXISTS idx_subscriptions_status;
DROP INDEX IF EXISTS idx_referral_codes_user_id;
DROP INDEX IF EXISTS idx_referral_codes_code;
