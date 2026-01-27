-- Create manual_goal_progress table for storing manually entered IEP goal progress data
CREATE TABLE IF NOT EXISTS public.manual_goal_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    iep_goal_index INTEGER NOT NULL CHECK (iep_goal_index >= 0),
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    observation_date DATE NOT NULL,
    source TEXT,  -- e.g., "Session observation", "Classroom feedback", "External assessment"
    notes TEXT,
    school_id VARCHAR(255) REFERENCES public.schools(id) ON DELETE CASCADE,
    district_id VARCHAR(255) REFERENCES public.districts(id) ON DELETE CASCADE,
    state_id VARCHAR(2) REFERENCES public.states(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_manual_goal_progress_student ON public.manual_goal_progress(student_id);
CREATE INDEX IF NOT EXISTS idx_manual_goal_progress_provider ON public.manual_goal_progress(provider_id);
CREATE INDEX IF NOT EXISTS idx_manual_goal_progress_date ON public.manual_goal_progress(observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_manual_goal_progress_school ON public.manual_goal_progress(school_id);

-- Enable RLS
ALTER TABLE public.manual_goal_progress ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (matching exit_tickets pattern)
-- Providers can view their own manual progress entries
CREATE POLICY "Providers can view own manual progress" ON public.manual_goal_progress
    FOR SELECT USING (auth.uid() = provider_id);

-- Providers can create manual progress entries
CREATE POLICY "Providers can create manual progress" ON public.manual_goal_progress
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

-- Providers can update their own manual progress entries
CREATE POLICY "Providers can update own manual progress" ON public.manual_goal_progress
    FOR UPDATE USING (auth.uid() = provider_id);

-- Providers can delete their own manual progress entries
CREATE POLICY "Providers can delete own manual progress" ON public.manual_goal_progress
    FOR DELETE USING (auth.uid() = provider_id);

-- Grant permissions
GRANT ALL ON public.manual_goal_progress TO authenticated;
GRANT ALL ON public.manual_goal_progress TO service_role;

-- Create trigger for updated_at (if function exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
        CREATE TRIGGER update_manual_goal_progress_updated_at
            BEFORE UPDATE ON public.manual_goal_progress
            FOR EACH ROW
            EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;
