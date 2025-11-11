-- Add school identification fields to todos table for multi-school support
-- This migration adds school_id, district_id, and state_id columns to support
-- filtering todos by school for users who work at multiple schools.
-- Existing todos will have NULL school_id and will be visible across all schools.

-- Add school identifier columns
ALTER TABLE public.todos
ADD COLUMN school_id varchar REFERENCES public.schools(id),
ADD COLUMN district_id varchar REFERENCES public.districts(id),
ADD COLUMN state_id varchar REFERENCES public.states(id);

-- Add index for efficient querying by user and school
CREATE INDEX IF NOT EXISTS idx_todos_user_school
ON public.todos(user_id, school_id);

-- Add comment explaining the schema
COMMENT ON COLUMN public.todos.school_id IS 'NCES School ID - links todo to a specific school. NULL means todo is visible across all schools (legacy/unassigned).';
COMMENT ON COLUMN public.todos.district_id IS 'NCES District ID - for consistency with other tables.';
COMMENT ON COLUMN public.todos.state_id IS 'State code - for consistency with other tables.';
