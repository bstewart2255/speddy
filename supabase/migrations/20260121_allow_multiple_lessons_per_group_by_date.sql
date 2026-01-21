-- Migration: Allow multiple lessons per group (one per date)
-- This fixes Bug 2: Notes persisting across weeks for group sessions
--
-- Previously: idx_lessons_group_id_unique enforced UNIQUE(group_id), preventing
-- multiple lessons per group and causing all weeks to share the same notes.
--
-- After: idx_lessons_group_id_date_unique enforces UNIQUE(group_id, lesson_date),
-- allowing each week to have its own lesson/notes.

-- Drop the old group_id-only unique constraint
DROP INDEX IF EXISTS idx_lessons_group_id_unique;

-- Create a composite unique index to allow multiple lessons per group (one per date)
CREATE UNIQUE INDEX idx_lessons_group_id_date_unique
ON public.lessons (group_id, lesson_date)
WHERE group_id IS NOT NULL;
