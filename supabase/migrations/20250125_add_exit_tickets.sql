-- Create exit_tickets table for storing generated exit tickets
CREATE TABLE IF NOT EXISTS public.exit_tickets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    provider_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    iep_goal_index INTEGER NOT NULL,
    iep_goal_text TEXT NOT NULL,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    completed_at TIMESTAMP WITH TIME ZONE,
    completion_data JSONB,
    school_id VARCHAR(255) REFERENCES public.schools(id),
    district_id VARCHAR(255) REFERENCES public.districts(id),
    state_id VARCHAR(2) REFERENCES public.states(id),
    CONSTRAINT exit_tickets_iep_goal_index_check CHECK (iep_goal_index >= 0)
);

-- Add column to track last used IEP goal index for exit tickets
ALTER TABLE public.student_details
ADD COLUMN IF NOT EXISTS last_exit_ticket_goal_index INTEGER DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_exit_tickets_provider_id ON public.exit_tickets(provider_id);
CREATE INDEX IF NOT EXISTS idx_exit_tickets_student_id ON public.exit_tickets(student_id);
CREATE INDEX IF NOT EXISTS idx_exit_tickets_created_at ON public.exit_tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exit_tickets_school_id ON public.exit_tickets(school_id);

-- Enable RLS
ALTER TABLE public.exit_tickets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Providers can see and create their own exit tickets
CREATE POLICY "Providers can view own exit tickets" ON public.exit_tickets
    FOR SELECT USING (auth.uid() = provider_id);

CREATE POLICY "Providers can create exit tickets" ON public.exit_tickets
    FOR INSERT WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Providers can update own exit tickets" ON public.exit_tickets
    FOR UPDATE USING (auth.uid() = provider_id);

CREATE POLICY "Providers can delete own exit tickets" ON public.exit_tickets
    FOR DELETE USING (auth.uid() = provider_id);

-- Grant permissions
GRANT ALL ON public.exit_tickets TO authenticated;
GRANT ALL ON public.exit_tickets TO service_role;