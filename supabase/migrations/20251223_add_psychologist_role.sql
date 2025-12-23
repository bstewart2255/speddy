-- Add 'psychologist' to the profiles role check constraint
-- This allows creating School Psychologist provider accounts

-- Drop the existing constraint
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add updated constraint with psychologist role
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
CHECK (role = ANY (ARRAY['resource'::text, 'speech'::text, 'ot'::text, 'counseling'::text, 'specialist'::text, 'sea'::text, 'teacher'::text, 'site_admin'::text, 'district_admin'::text, 'psychologist'::text]));
