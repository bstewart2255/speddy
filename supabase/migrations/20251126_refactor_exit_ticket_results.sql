-- Refactor exit_ticket_results to match progress_check_results structure
-- Changes from 1-10 rating per ticket to per-problem correct/incorrect/excluded grading
--
-- This enables unified progress tracking in the Student Details Progress tab

-- Drop old table (only 1 existing result, safe to drop)
DROP TABLE IF EXISTS exit_ticket_results;

-- Recreate with new structure matching progress_check_results
CREATE TABLE exit_ticket_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exit_ticket_id UUID NOT NULL REFERENCES exit_tickets(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    problem_index INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('correct', 'incorrect', 'excluded')),
    notes TEXT,
    graded_by UUID NOT NULL REFERENCES auth.users(id),
    graded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    iep_goal_text TEXT NOT NULL,
    iep_goal_index INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- One result per problem per exit ticket
    UNIQUE(exit_ticket_id, problem_index)
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
                s.school_id = (SELECT school_id FROM public.profiles WHERE id = (select auth.uid()))
                OR s.district_id = (SELECT district_id FROM public.profiles WHERE id = (select auth.uid()))
                OR s.state_id = (SELECT state_id FROM public.profiles WHERE id = (select auth.uid()))
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
                s.school_id = (SELECT school_id FROM public.profiles WHERE id = (select auth.uid()))
                OR s.district_id = (SELECT district_id FROM public.profiles WHERE id = (select auth.uid()))
                OR s.state_id = (SELECT state_id FROM public.profiles WHERE id = (select auth.uid()))
            )
        )
        AND graded_by = (select auth.uid())
    );

-- Policy: Users can update their own results
CREATE POLICY "Users can update their own exit ticket results"
    ON exit_ticket_results
    FOR UPDATE
    USING (graded_by = (select auth.uid()))
    WITH CHECK (graded_by = (select auth.uid()));

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
COMMENT ON TABLE exit_ticket_results IS 'Stores per-problem grading results for exit tickets to track student progress toward IEP goals';
