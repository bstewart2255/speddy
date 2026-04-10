-- Add 'intervention' as a valid profile role for Intervention Teachers
ALTER TABLE profiles
  DROP CONSTRAINT profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check CHECK (
    role = ANY (ARRAY[
      'resource'::text, 'speech'::text, 'ot'::text, 'counseling'::text,
      'specialist'::text, 'sea'::text, 'teacher'::text, 'site_admin'::text,
      'district_admin'::text, 'psychologist'::text, 'intervention'::text
    ])
  );
