-- Create group_documents table for attaching documents to session groups
CREATE TABLE IF NOT EXISTS public.group_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL,

  -- Document metadata
  title TEXT NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'link', 'note')),

  -- Document content (varies by type)
  content TEXT, -- For notes
  url TEXT, -- For links and PDFs
  file_path TEXT, -- For uploaded PDFs stored in Supabase Storage

  -- Ownership and tracking
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX idx_group_documents_group_id ON public.group_documents(group_id);
CREATE INDEX idx_group_documents_created_by ON public.group_documents(created_by);
CREATE INDEX idx_group_documents_document_type ON public.group_documents(document_type);

-- Add CHECK constraints to enforce type-specific field requirements
ALTER TABLE public.group_documents
ADD CONSTRAINT group_documents_note_check
  CHECK (
    document_type <> 'note'
    OR (content IS NOT NULL AND url IS NULL AND file_path IS NULL)
  );

ALTER TABLE public.group_documents
ADD CONSTRAINT group_documents_link_check
  CHECK (
    document_type <> 'link'
    OR (url IS NOT NULL AND content IS NULL AND file_path IS NULL)
  );

ALTER TABLE public.group_documents
ADD CONSTRAINT group_documents_pdf_check
  CHECK (
    document_type <> 'pdf'
    OR ((url IS NOT NULL OR file_path IS NOT NULL) AND content IS NULL)
  );

-- Enable Row Level Security
ALTER TABLE public.group_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Users can view documents for groups they have access to
-- (i.e., groups containing sessions they own or are assigned to)
CREATE POLICY "Users can view documents for their groups"
  ON public.group_documents
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.schedule_sessions
      WHERE schedule_sessions.group_id = group_documents.group_id
        AND (
          schedule_sessions.provider_id = auth.uid()
          OR schedule_sessions.assigned_to_specialist_id = auth.uid()
          OR schedule_sessions.assigned_to_sea_id = auth.uid()
        )
    )
  );

-- Users can insert documents for groups they have access to
CREATE POLICY "Users can create documents for their groups"
  ON public.group_documents
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.schedule_sessions
      WHERE schedule_sessions.group_id = group_documents.group_id
        AND (
          schedule_sessions.provider_id = auth.uid()
          OR schedule_sessions.assigned_to_specialist_id = auth.uid()
          OR schedule_sessions.assigned_to_sea_id = auth.uid()
        )
    )
  );

-- Users can update documents they created
CREATE POLICY "Users can update their own documents"
  ON public.group_documents
  FOR UPDATE
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- Users can delete documents they created
CREATE POLICY "Users can delete their own documents"
  ON public.group_documents
  FOR DELETE
  USING (created_by = auth.uid());

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_group_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public;

CREATE TRIGGER update_group_documents_updated_at
  BEFORE UPDATE ON public.group_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_group_documents_updated_at();
