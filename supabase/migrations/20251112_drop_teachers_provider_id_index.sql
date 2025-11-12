-- Drop idx_teachers_provider_id index since provider_id column was removed
-- This index was created in 20251111_add_critical_foreign_key_indexes.sql
-- but is no longer needed after removing provider_id from teachers table

DROP INDEX IF EXISTS public.idx_teachers_provider_id;

COMMENT ON TABLE public.teachers
IS 'Teacher records managed at school level. Teachers can be created by site admins and self-manage via account_id when linked to a user account. The provider_id column and its index were removed as teachers are not specialist-owned resources.';
