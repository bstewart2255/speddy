-- Create ai_generated_lessons table for storing AI-generated lesson plans
-- Migration: 20250819_create_ai_generated_lessons.sql

-- Create the ai_generated_lessons table
CREATE TABLE IF NOT EXISTS public.ai_generated_lessons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_date DATE NOT NULL,
    content TEXT,
    prompt TEXT,
    session_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for query performance
CREATE INDEX IF NOT EXISTS idx_ai_generated_lessons_provider_id ON public.ai_generated_lessons(provider_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_lessons_lesson_date ON public.ai_generated_lessons(lesson_date);
CREATE INDEX IF NOT EXISTS idx_ai_generated_lessons_provider_date ON public.ai_generated_lessons(provider_id, lesson_date);

-- Enable Row Level Security (RLS)
ALTER TABLE public.ai_generated_lessons ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Providers can view their own lesson plans
CREATE POLICY "Providers can view own lesson plans" ON public.ai_generated_lessons
  FOR SELECT
  USING (auth.uid() = provider_id);

-- RLS Policy: Providers can create their own lesson plans
CREATE POLICY "Providers can create own lesson plans" ON public.ai_generated_lessons
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

-- RLS Policy: Providers can update their own lesson plans
CREATE POLICY "Providers can update own lesson plans" ON public.ai_generated_lessons
  FOR UPDATE
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

-- RLS Policy: Providers can delete their own lesson plans
CREATE POLICY "Providers can delete own lesson plans" ON public.ai_generated_lessons
  FOR DELETE
  USING (auth.uid() = provider_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ai_generated_lessons_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_ai_generated_lessons_updated_at
  BEFORE UPDATE ON public.ai_generated_lessons
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_generated_lessons_updated_at();

-- Add comments to document the table and columns
COMMENT ON TABLE public.ai_generated_lessons IS 'Stores AI-generated lesson plans for providers';
COMMENT ON COLUMN public.ai_generated_lessons.provider_id IS 'Reference to the provider who owns this lesson plan';
COMMENT ON COLUMN public.ai_generated_lessons.lesson_date IS 'Date for which the lesson plan is intended';
COMMENT ON COLUMN public.ai_generated_lessons.content IS 'The generated lesson plan content';
COMMENT ON COLUMN public.ai_generated_lessons.prompt IS 'The prompt used to generate the lesson plan';
COMMENT ON COLUMN public.ai_generated_lessons.session_data IS 'Additional session data in JSON format';