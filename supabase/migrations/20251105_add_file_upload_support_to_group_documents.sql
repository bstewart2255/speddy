-- Add file upload support to group_documents table
-- This migration adds columns for tracking uploaded file metadata

-- Add new columns for file metadata
ALTER TABLE public.group_documents
ADD COLUMN IF NOT EXISTS mime_type TEXT,
ADD COLUMN IF NOT EXISTS file_size BIGINT,
ADD COLUMN IF NOT EXISTS original_filename TEXT;

-- Update the document_type constraint to include 'file'
ALTER TABLE public.group_documents
DROP CONSTRAINT IF EXISTS group_documents_document_type_check;

ALTER TABLE public.group_documents
ADD CONSTRAINT group_documents_document_type_check
CHECK (document_type IN ('pdf', 'link', 'note', 'file'));

-- Add comment to describe the new columns
COMMENT ON COLUMN public.group_documents.mime_type IS 'MIME type of the uploaded file (e.g., application/pdf, image/png)';
COMMENT ON COLUMN public.group_documents.file_size IS 'Size of the uploaded file in bytes';
COMMENT ON COLUMN public.group_documents.original_filename IS 'Original filename as uploaded by the user';

-- Create index on document_type for faster queries
CREATE INDEX IF NOT EXISTS idx_group_documents_document_type ON public.group_documents(document_type);

-- Create index on group_id and created_at for efficient listing
CREATE INDEX IF NOT EXISTS idx_group_documents_group_created ON public.group_documents(group_id, created_at DESC);
