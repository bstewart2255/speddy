-- Create exit_ticket_results table to track student performance on exit tickets
CREATE TABLE IF NOT EXISTS exit_ticket_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exit_ticket_id UUID NOT NULL REFERENCES exit_tickets(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 10),
    notes TEXT,
    graded_by UUID NOT NULL REFERENCES auth.users(id),
    graded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    iep_goal_text TEXT NOT NULL,
    iep_goal_index INTEGER NOT NULL,

    -- Ensure one result per exit ticket (since exit tickets are 1:1 with students)
    UNIQUE(exit_ticket_id),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for common queries
CREATE INDEX idx_exit_ticket_results_student ON exit_ticket_results(student_id);
CREATE INDEX idx_exit_ticket_results_exit_ticket ON exit_ticket_results(exit_ticket_id);
CREATE INDEX idx_exit_ticket_results_graded_at ON exit_ticket_results(graded_at DESC);

-- Add RLS policies
ALTER TABLE exit_ticket_results ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view results for students in their organization
CREATE POLICY "Users can view exit ticket results in their org"
    ON exit_ticket_results
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = exit_ticket_results.student_id
            AND (
                s.school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
                OR s.district_id = (SELECT district_id FROM public.profiles WHERE id = auth.uid())
                OR s.state_id = (SELECT state_id FROM public.profiles WHERE id = auth.uid())
            )
        )
    );

-- Policy: Users can insert results for students in their organization
CREATE POLICY "Users can create exit ticket results in their org"
    ON exit_ticket_results
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM students s
            WHERE s.id = exit_ticket_results.student_id
            AND (
                s.school_id = (SELECT school_id FROM public.profiles WHERE id = auth.uid())
                OR s.district_id = (SELECT district_id FROM public.profiles WHERE id = auth.uid())
                OR s.state_id = (SELECT state_id FROM public.profiles WHERE id = auth.uid())
            )
        )
        AND graded_by = auth.uid()
    );

-- Policy: Users can update their own results
CREATE POLICY "Users can update their own exit ticket results"
    ON exit_ticket_results
    FOR UPDATE
    USING (graded_by = auth.uid())
    WITH CHECK (graded_by = auth.uid());

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_exit_ticket_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_exit_ticket_results_updated_at
    BEFORE UPDATE ON exit_ticket_results
    FOR EACH ROW
    EXECUTE FUNCTION update_exit_ticket_results_updated_at();

-- Add comment
COMMENT ON TABLE exit_ticket_results IS 'Stores teacher ratings and feedback for completed exit tickets to track student progress toward IEP goals';
