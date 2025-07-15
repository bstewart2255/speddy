-- Enable RLS on students and bell_schedules tables
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
CREATE POLICY "Users can view their own students" ON public.students
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own students" ON public.students
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own students" ON public.students
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own students" ON public.students
    FOR DELETE USING (auth.uid() = provider_id);

-- Bell schedules table policies
CREATE POLICY "Users can view their own bell schedules" ON public.bell_schedules
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own bell schedules" ON public.bell_schedules
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own bell schedules" ON public.bell_schedules
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own bell schedules" ON public.bell_schedules
    FOR DELETE USING (auth.uid() = provider_id);

-- Special activities table policies
CREATE POLICY "Users can view their own special activities" ON public.special_activities
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own special activities" ON public.special_activities
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own special activities" ON public.special_activities
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own special activities" ON public.special_activities
    FOR DELETE USING (auth.uid() = provider_id);

-- Schedule sessions table policies
CREATE POLICY "Users can view their own schedule sessions" ON public.schedule_sessions
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own schedule sessions" ON public.schedule_sessions
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own schedule sessions" ON public.schedule_sessions
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own schedule sessions" ON public.schedule_sessions
    FOR DELETE USING (auth.uid() = provider_id);

-- Student details table policies
CREATE POLICY "Users can view student details for their students" ON public.student_details
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = student_details.student_id
            AND students.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert student details for their students" ON public.student_details
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = student_details.student_id
            AND students.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can update student details for their students" ON public.student_details
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = student_details.student_id
            AND students.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete student details for their students" ON public.student_details
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = student_details.student_id
            AND students.provider_id = auth.uid()
        )
    );

-- School hours table policies
CREATE POLICY "Users can view their own school hours" ON public.school_hours
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own school hours" ON public.school_hours
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own school hours" ON public.school_hours
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own school hours" ON public.school_hours
    FOR DELETE USING (auth.uid() = provider_id);

-- Lessons table policies
CREATE POLICY "Users can view their own lessons" ON public.lessons
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own lessons" ON public.lessons
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own lessons" ON public.lessons
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own lessons" ON public.lessons
    FOR DELETE USING (auth.uid() = provider_id);

-- Worksheets table policies
CREATE POLICY "Users can view worksheets for their lessons" ON public.worksheets
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.lessons
            WHERE lessons.id = worksheets.lesson_id
            AND lessons.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert worksheets for their lessons" ON public.worksheets
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.lessons
            WHERE lessons.id = worksheets.lesson_id
            AND lessons.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can update worksheets for their lessons" ON public.worksheets
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.lessons
            WHERE lessons.id = worksheets.lesson_id
            AND lessons.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete worksheets for their lessons" ON public.worksheets
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.lessons
            WHERE lessons.id = worksheets.lesson_id
            AND lessons.provider_id = auth.uid()
        )
    );

-- Worksheet submissions table policies
CREATE POLICY "Users can view worksheet submissions for their worksheets" ON public.worksheet_submissions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.worksheets w
            JOIN public.lessons l ON l.id = w.lesson_id
            WHERE w.id = worksheet_submissions.worksheet_id
            AND l.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert worksheet submissions for their worksheets" ON public.worksheet_submissions
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.worksheets w
            JOIN public.lessons l ON l.id = w.lesson_id
            WHERE w.id = worksheet_submissions.worksheet_id
            AND l.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can update worksheet submissions for their worksheets" ON public.worksheet_submissions
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.worksheets w
            JOIN public.lessons l ON l.id = w.lesson_id
            WHERE w.id = worksheet_submissions.worksheet_id
            AND l.provider_id = auth.uid()
        )
    );

-- IEP Goal Progress table policies
CREATE POLICY "Users can view IEP progress for their students" ON public.iep_goal_progress
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = iep_goal_progress.student_id
            AND students.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert IEP progress for their students" ON public.iep_goal_progress
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = iep_goal_progress.student_id
            AND students.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can update IEP progress for their students" ON public.iep_goal_progress
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = iep_goal_progress.student_id
            AND students.provider_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete IEP progress for their students" ON public.iep_goal_progress
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.students
            WHERE students.id = iep_goal_progress.student_id
            AND students.provider_id = auth.uid()
        )
    );

-- Todos table policies
CREATE POLICY "Users can view their own todos" ON public.todos
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own todos" ON public.todos
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own todos" ON public.todos
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own todos" ON public.todos
    FOR DELETE USING (auth.uid() = user_id);

-- Service role policies for all tables (for admin access)
CREATE POLICY "Service role has full access to students" ON public.students
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to bell_schedules" ON public.bell_schedules
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to special_activities" ON public.special_activities
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to schedule_sessions" ON public.schedule_sessions
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to student_details" ON public.student_details
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to school_hours" ON public.school_hours
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to lessons" ON public.lessons
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to worksheets" ON public.worksheets
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to worksheet_submissions" ON public.worksheet_submissions
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to iep_goal_progress" ON public.iep_goal_progress
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role has full access to todos" ON public.todos
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');