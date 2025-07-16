-- Add fields for worksheet uploads
ALTER TABLE public.worksheets
ADD COLUMN IF NOT EXISTS uploaded_file_path TEXT,
ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMP WITH TIME ZONE;

-- Create storage bucket for worksheet uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'worksheets',
  'worksheets',
  false,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for the storage bucket
CREATE POLICY "Anyone can upload worksheet images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'worksheets');

CREATE POLICY "Anyone can view worksheet images"
ON storage.objects FOR SELECT
USING (bucket_id = 'worksheets');

-- Update database types to reflect the new columns
COMMENT ON COLUMN public.worksheets.uploaded_file_path IS 'Path to the uploaded worksheet image in storage';
COMMENT ON COLUMN public.worksheets.uploaded_at IS 'Timestamp when the worksheet was uploaded';