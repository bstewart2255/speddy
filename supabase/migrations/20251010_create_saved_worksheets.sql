-- Create saved_worksheets table for user-uploaded worksheet files
CREATE TABLE IF NOT EXISTS public.saved_worksheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'doc', 'docx')),
  file_size INTEGER NOT NULL CHECK (file_size > 0 AND file_size <= 10485760), -- 10MB max
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for faster user queries
CREATE INDEX idx_saved_worksheets_provider_id ON public.saved_worksheets(provider_id);
CREATE INDEX idx_saved_worksheets_created_at ON public.saved_worksheets(created_at DESC);

-- Enable RLS
ALTER TABLE public.saved_worksheets ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own worksheets
CREATE POLICY "Users can view their own saved worksheets"
  ON public.saved_worksheets
  FOR SELECT
  USING (auth.uid() = provider_id);

CREATE POLICY "Users can insert their own saved worksheets"
  ON public.saved_worksheets
  FOR INSERT
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can update their own saved worksheets"
  ON public.saved_worksheets
  FOR UPDATE
  USING (auth.uid() = provider_id)
  WITH CHECK (auth.uid() = provider_id);

CREATE POLICY "Users can delete their own saved worksheets"
  ON public.saved_worksheets
  FOR DELETE
  USING (auth.uid() = provider_id);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_saved_worksheets_updated_at
  BEFORE UPDATE ON public.saved_worksheets
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Create storage bucket for saved worksheets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'saved-worksheets',
  'saved-worksheets',
  false, -- private bucket
  10485760, -- 10MB
  ARRAY['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: Users can only access their own files
CREATE POLICY "Users can upload their own worksheets"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'saved-worksheets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view their own worksheets"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'saved-worksheets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own worksheets"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'saved-worksheets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
