-- SEA Payment Exemption Documentation
-- Date: 2025-07-11
-- 
-- Special Education Assistants (SEAs) are exempt from payment requirements.
-- This is enforced in the application code, not in the database.
-- 
-- Changes made:
-- 1. Signup flow skips payment step for SEA role
-- 2. Billing page shows free access message for SEAs
-- 3. User menu hides billing link for SEAs
-- 
-- No database schema changes required.
-- SEAs simply don't have entries in the subscriptions table.

-- Add a comment to the profiles table to document this business rule
COMMENT ON COLUMN profiles.role IS 'User role. SEA (Special Education Assistant) users have free access and are exempt from payment requirements.';
