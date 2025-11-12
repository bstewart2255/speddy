-- Link existing teacher user accounts to their teacher records
-- This fixes teacher accounts that were created but not properly linked via account_id

-- Link Aimee Grispo's account
UPDATE public.teachers
SET account_id = '710e27c5-c945-40b9-a3b1-419fe18c959e'
WHERE email = 'grispoa@mdusd.org'
  AND account_id IS NULL;

-- General fix: Link any other teacher records where email matches a teacher profile
-- but account_id is not set
UPDATE public.teachers t
SET account_id = p.id
FROM public.profiles p
WHERE t.email = p.email
  AND p.role = 'teacher'
  AND t.account_id IS NULL
  AND t.email IS NOT NULL;

COMMENT ON TABLE public.teachers
IS 'Teacher records managed at school level. Teachers can be created by site admins and self-manage via account_id when linked to a user account.';
