-- This is a focused migration for just students and bell_schedules tables
-- Run this if the larger migration fails

-- Enable RLS (safe to run multiple times)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_schedules ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to ensure clean state)
DROP POLICY IF EXISTS "Users can view their own students" ON public.students;
DROP POLICY IF EXISTS "Users can insert their own students" ON public.students;
DROP POLICY IF EXISTS "Users can update their own students" ON public.students;
DROP POLICY IF EXISTS "Users can delete their own students" ON public.students;

DROP POLICY IF EXISTS "Users can view their own bell schedules" ON public.bell_schedules;
DROP POLICY IF EXISTS "Users can insert their own bell schedules" ON public.bell_schedules;
DROP POLICY IF EXISTS "Users can update their own bell schedules" ON public.bell_schedules;
DROP POLICY IF EXISTS "Users can delete their own bell schedules" ON public.bell_schedules;

-- Create policies for students table
CREATE POLICY "Users can view their own students" ON public.students
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own students" ON public.students
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own students" ON public.students
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own students" ON public.students
    FOR DELETE USING (auth.uid() = provider_id);

-- Create policies for bell_schedules table
CREATE POLICY "Users can view their own bell schedules" ON public.bell_schedules
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own bell schedules" ON public.bell_schedules
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own bell schedules" ON public.bell_schedules
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own bell schedules" ON public.bell_schedules
    FOR DELETE USING (auth.uid() = provider_id);