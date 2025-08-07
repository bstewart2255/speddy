-- Create schedule_share_requests table for team schedule sharing feature
CREATE TABLE IF NOT EXISTS public.schedule_share_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sharer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Composite unique constraint to prevent duplicate requests
  CONSTRAINT unique_share_request UNIQUE(sharer_id, school_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_schedule_share_requests_school_id ON public.schedule_share_requests(school_id);
CREATE INDEX IF NOT EXISTS idx_schedule_share_requests_sharer_id ON public.schedule_share_requests(sharer_id);

-- Enable RLS
ALTER TABLE public.schedule_share_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view share requests for their schools
CREATE POLICY "Users can view share requests for their schools" 
ON public.schedule_share_requests 
FOR SELECT 
USING (
  school_id IN (
    -- Primary school from profile
    SELECT school_id FROM public.profiles WHERE id = auth.uid()
    UNION
    -- Additional schools from provider_schools
    SELECT school_id FROM public.provider_schools WHERE provider_id = auth.uid()
  )
);

-- RLS Policy: Users can create share requests for their schools
CREATE POLICY "Users can create share requests for their schools" 
ON public.schedule_share_requests 
FOR INSERT 
WITH CHECK (
  sharer_id = auth.uid() AND
  school_id IN (
    -- Primary school from profile
    SELECT school_id FROM public.profiles WHERE id = auth.uid()
    UNION
    -- Additional schools from provider_schools
    SELECT school_id FROM public.provider_schools WHERE provider_id = auth.uid()
  )
);

-- RLS Policy: Users can delete their own share requests
CREATE POLICY "Users can delete their own share requests" 
ON public.schedule_share_requests 
FOR DELETE 
USING (sharer_id = auth.uid());

-- Add school_id columns to bell_schedules and special_activities if they don't exist
-- These are likely already present based on the codebase, but adding conditionally for safety
DO $$ 
BEGIN
  -- Check and add school_id to bell_schedules
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'bell_schedules' 
    AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.bell_schedules 
    ADD COLUMN school_id UUID REFERENCES public.schools(id);
    
    -- Create index for performance
    CREATE INDEX idx_bell_schedules_school_id ON public.bell_schedules(school_id);
  END IF;

  -- Check and add school_id to special_activities
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'special_activities' 
    AND column_name = 'school_id'
  ) THEN
    ALTER TABLE public.special_activities 
    ADD COLUMN school_id UUID REFERENCES public.schools(id);
    
    -- Create index for performance
    CREATE INDEX idx_special_activities_school_id ON public.special_activities(school_id);
  END IF;
END $$;

-- Grant necessary permissions
GRANT ALL ON public.schedule_share_requests TO authenticated;
GRANT ALL ON public.schedule_share_requests TO service_role;