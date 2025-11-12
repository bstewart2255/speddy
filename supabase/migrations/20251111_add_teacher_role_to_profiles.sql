-- Add 'teacher' role type to profiles table constraint
-- This allows general education teachers to have accounts in the system

-- Drop the existing role check constraint
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

-- Add the constraint back with 'teacher' included
ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role = ANY (ARRAY[
    'resource'::text,
    'speech'::text,
    'ot'::text,
    'counseling'::text,
    'specialist'::text,
    'sea'::text,
    'teacher'::text
]));

-- Add comment explaining the teacher role
COMMENT ON CONSTRAINT profiles_role_check ON public.profiles IS
'Valid user roles: resource (resource specialist), speech (speech therapist), ot (occupational therapist), counseling (counselor), specialist (program specialist), sea (special education assistant), teacher (general education teacher)';

-- Verify the constraint was updated
DO $$
DECLARE
    constraint_def text;
BEGIN
    SELECT pg_get_constraintdef(con.oid) INTO constraint_def
    FROM pg_constraint con
    INNER JOIN pg_class rel ON rel.oid = con.conrelid
    INNER JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'profiles'
      AND con.conname = 'profiles_role_check';

    IF constraint_def LIKE '%teacher%' THEN
        RAISE NOTICE 'SUCCESS: Teacher role added to profiles constraint';
    ELSE
        RAISE EXCEPTION 'FAILED: Teacher role not found in constraint';
    END IF;
END $$;
