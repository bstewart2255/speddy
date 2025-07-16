-- Create manual_lesson_plans table
CREATE TABLE IF NOT EXISTS public.manual_lesson_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_date DATE NOT NULL,
    title TEXT NOT NULL,
    subject TEXT,
    grade_levels TEXT[],
    duration_minutes INTEGER CHECK (duration_minutes > 0),
    objectives TEXT,
    materials TEXT,
    activities JSONB,
    assessment TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for performance
CREATE INDEX idx_manual_lesson_plans_provider_date ON public.manual_lesson_plans(provider_id, lesson_date);

-- Add RLS policies
ALTER TABLE public.manual_lesson_plans ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own lesson plans
CREATE POLICY "Users can view own manual lesson plans" 
    ON public.manual_lesson_plans
    FOR SELECT
    USING (auth.uid() = provider_id);

-- Policy: Users can create their own lesson plans
CREATE POLICY "Users can create own manual lesson plans" 
    ON public.manual_lesson_plans
    FOR INSERT
    WITH CHECK (auth.uid() = provider_id);

-- Policy: Users can update their own lesson plans
CREATE POLICY "Users can update own manual lesson plans" 
    ON public.manual_lesson_plans
    FOR UPDATE
    USING (auth.uid() = provider_id)
    WITH CHECK (auth.uid() = provider_id);

-- Policy: Users can delete their own lesson plans
CREATE POLICY "Users can delete own manual lesson plans" 
    ON public.manual_lesson_plans
    FOR DELETE
    USING (auth.uid() = provider_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_manual_lesson_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_manual_lesson_plans_updated_at
    BEFORE UPDATE ON public.manual_lesson_plans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_manual_lesson_plans_updated_at();

-- Add comments for documentation
COMMENT ON TABLE public.manual_lesson_plans IS 'Stores manual lesson plans created by providers';
COMMENT ON COLUMN public.manual_lesson_plans.id IS 'Unique identifier for the lesson plan';
COMMENT ON COLUMN public.manual_lesson_plans.provider_id IS 'Foreign key to the provider who created the lesson';
COMMENT ON COLUMN public.manual_lesson_plans.lesson_date IS 'Date when this lesson is planned for';
COMMENT ON COLUMN public.manual_lesson_plans.title IS 'Title of the lesson plan';
COMMENT ON COLUMN public.manual_lesson_plans.subject IS 'Subject or topic of the lesson';
COMMENT ON COLUMN public.manual_lesson_plans.grade_levels IS 'Array of grade levels this lesson is suitable for';
COMMENT ON COLUMN public.manual_lesson_plans.duration_minutes IS 'Expected duration of the lesson in minutes';
COMMENT ON COLUMN public.manual_lesson_plans.objectives IS 'Learning objectives for the lesson';
COMMENT ON COLUMN public.manual_lesson_plans.materials IS 'Materials needed for the lesson';
COMMENT ON COLUMN public.manual_lesson_plans.activities IS 'JSON structure containing lesson activities and steps';
COMMENT ON COLUMN public.manual_lesson_plans.assessment IS 'Assessment methods for the lesson';
COMMENT ON COLUMN public.manual_lesson_plans.notes IS 'Additional notes or comments';
COMMENT ON COLUMN public.manual_lesson_plans.created_at IS 'Timestamp when the lesson plan was created';
COMMENT ON COLUMN public.manual_lesson_plans.updated_at IS 'Timestamp when the lesson plan was last updated';