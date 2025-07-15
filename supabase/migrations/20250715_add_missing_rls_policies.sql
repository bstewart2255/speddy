-- Drop the existing migration if it was partially applied
-- This is safe because we'll recreate all necessary policies

-- First, let's check and create policies only if they don't exist
-- We'll use DO blocks to handle the conditional creation

-- Enable RLS on tables (safe to run multiple times)
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bell_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.special_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worksheet_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iep_goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

-- Students table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Users can view their own students'
    ) THEN
        CREATE POLICY "Users can view their own students" ON public.students
            FOR SELECT USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Users can insert their own students'
    ) THEN
        CREATE POLICY "Users can insert their own students" ON public.students
            FOR INSERT WITH CHECK (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Users can update their own students'
    ) THEN
        CREATE POLICY "Users can update their own students" ON public.students
            FOR UPDATE USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Users can delete their own students'
    ) THEN
        CREATE POLICY "Users can delete their own students" ON public.students
            FOR DELETE USING (auth.uid() = provider_id);
    END IF;
END $$;

-- Bell schedules table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bell_schedules' 
        AND policyname = 'Users can view their own bell schedules'
    ) THEN
        CREATE POLICY "Users can view their own bell schedules" ON public.bell_schedules
            FOR SELECT USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bell_schedules' 
        AND policyname = 'Users can insert their own bell schedules'
    ) THEN
        CREATE POLICY "Users can insert their own bell schedules" ON public.bell_schedules
            FOR INSERT WITH CHECK (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bell_schedules' 
        AND policyname = 'Users can update their own bell schedules'
    ) THEN
        CREATE POLICY "Users can update their own bell schedules" ON public.bell_schedules
            FOR UPDATE USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bell_schedules' 
        AND policyname = 'Users can delete their own bell schedules'
    ) THEN
        CREATE POLICY "Users can delete their own bell schedules" ON public.bell_schedules
            FOR DELETE USING (auth.uid() = provider_id);
    END IF;
END $$;

-- Special activities table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'special_activities' 
        AND policyname = 'Users can view their own special activities'
    ) THEN
        CREATE POLICY "Users can view their own special activities" ON public.special_activities
            FOR SELECT USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'special_activities' 
        AND policyname = 'Users can insert their own special activities'
    ) THEN
        CREATE POLICY "Users can insert their own special activities" ON public.special_activities
            FOR INSERT WITH CHECK (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'special_activities' 
        AND policyname = 'Users can update their own special activities'
    ) THEN
        CREATE POLICY "Users can update their own special activities" ON public.special_activities
            FOR UPDATE USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'special_activities' 
        AND policyname = 'Users can delete their own special activities'
    ) THEN
        CREATE POLICY "Users can delete their own special activities" ON public.special_activities
            FOR DELETE USING (auth.uid() = provider_id);
    END IF;
END $$;

-- Schedule sessions table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schedule_sessions' 
        AND policyname = 'Users can view their own schedule sessions'
    ) THEN
        CREATE POLICY "Users can view their own schedule sessions" ON public.schedule_sessions
            FOR SELECT USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schedule_sessions' 
        AND policyname = 'Users can insert their own schedule sessions'
    ) THEN
        CREATE POLICY "Users can insert their own schedule sessions" ON public.schedule_sessions
            FOR INSERT WITH CHECK (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schedule_sessions' 
        AND policyname = 'Users can update their own schedule sessions'
    ) THEN
        CREATE POLICY "Users can update their own schedule sessions" ON public.schedule_sessions
            FOR UPDATE USING (auth.uid() = provider_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schedule_sessions' 
        AND policyname = 'Users can delete their own schedule sessions'
    ) THEN
        CREATE POLICY "Users can delete their own schedule sessions" ON public.schedule_sessions
            FOR DELETE USING (auth.uid() = provider_id);
    END IF;
END $$;

-- Student details table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_details' 
        AND policyname = 'Users can view student details for their students'
    ) THEN
        CREATE POLICY "Users can view student details for their students" ON public.student_details
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = student_details.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_details' 
        AND policyname = 'Users can insert student details for their students'
    ) THEN
        CREATE POLICY "Users can insert student details for their students" ON public.student_details
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = student_details.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_details' 
        AND policyname = 'Users can update student details for their students'
    ) THEN
        CREATE POLICY "Users can update student details for their students" ON public.student_details
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = student_details.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_details' 
        AND policyname = 'Users can delete student details for their students'
    ) THEN
        CREATE POLICY "Users can delete student details for their students" ON public.student_details
            FOR DELETE USING (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = student_details.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
END $$;

-- IEP Goal Progress table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'iep_goal_progress' 
        AND policyname = 'Users can view IEP progress for their students'
    ) THEN
        CREATE POLICY "Users can view IEP progress for their students" ON public.iep_goal_progress
            FOR SELECT USING (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = iep_goal_progress.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'iep_goal_progress' 
        AND policyname = 'Users can insert IEP progress for their students'
    ) THEN
        CREATE POLICY "Users can insert IEP progress for their students" ON public.iep_goal_progress
            FOR INSERT WITH CHECK (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = iep_goal_progress.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'iep_goal_progress' 
        AND policyname = 'Users can update IEP progress for their students'
    ) THEN
        CREATE POLICY "Users can update IEP progress for their students" ON public.iep_goal_progress
            FOR UPDATE USING (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = iep_goal_progress.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'iep_goal_progress' 
        AND policyname = 'Users can delete IEP progress for their students'
    ) THEN
        CREATE POLICY "Users can delete IEP progress for their students" ON public.iep_goal_progress
            FOR DELETE USING (
                EXISTS (
                    SELECT 1 FROM public.students
                    WHERE students.id = iep_goal_progress.student_id
                    AND students.provider_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Todos table policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'todos' 
        AND policyname = 'Users can view their own todos'
    ) THEN
        CREATE POLICY "Users can view their own todos" ON public.todos
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'todos' 
        AND policyname = 'Users can insert their own todos'
    ) THEN
        CREATE POLICY "Users can insert their own todos" ON public.todos
            FOR INSERT WITH CHECK (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'todos' 
        AND policyname = 'Users can update their own todos'
    ) THEN
        CREATE POLICY "Users can update their own todos" ON public.todos
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'todos' 
        AND policyname = 'Users can delete their own todos'
    ) THEN
        CREATE POLICY "Users can delete their own todos" ON public.todos
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Service role policies
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'students' 
        AND policyname = 'Service role has full access to students'
    ) THEN
        CREATE POLICY "Service role has full access to students" ON public.students
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bell_schedules' 
        AND policyname = 'Service role has full access to bell_schedules'
    ) THEN
        CREATE POLICY "Service role has full access to bell_schedules" ON public.bell_schedules
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'special_activities' 
        AND policyname = 'Service role has full access to special_activities'
    ) THEN
        CREATE POLICY "Service role has full access to special_activities" ON public.special_activities
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schedule_sessions' 
        AND policyname = 'Service role has full access to schedule_sessions'
    ) THEN
        CREATE POLICY "Service role has full access to schedule_sessions" ON public.schedule_sessions
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'student_details' 
        AND policyname = 'Service role has full access to student_details'
    ) THEN
        CREATE POLICY "Service role has full access to student_details" ON public.student_details
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'iep_goal_progress' 
        AND policyname = 'Service role has full access to iep_goal_progress'
    ) THEN
        CREATE POLICY "Service role has full access to iep_goal_progress" ON public.iep_goal_progress
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'todos' 
        AND policyname = 'Service role has full access to todos'
    ) THEN
        CREATE POLICY "Service role has full access to todos" ON public.todos
            FOR ALL USING (auth.jwt()->>'role' = 'service_role');
    END IF;
END $$;

-- Note: We're skipping school_hours, lessons, worksheets, and worksheet_submissions 
-- as they already have policies according to the error message