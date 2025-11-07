-- Create session_documents table for individual session document management
CREATE TABLE IF NOT EXISTS public.session_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.schedule_sessions(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'link', 'note', 'file')),
    content TEXT,
    url TEXT,
    file_path TEXT,
    mime_type TEXT,
    file_size BIGINT,
    original_filename TEXT,
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.session_documents IS 'Documents attached to individual sessions (PDFs, links, notes, files)';
COMMENT ON COLUMN public.session_documents.mime_type IS 'MIME type of the uploaded file (e.g., application/pdf, image/png)';
COMMENT ON COLUMN public.session_documents.file_size IS 'Size of the uploaded file in bytes';
COMMENT ON COLUMN public.session_documents.original_filename IS 'Original filename as uploaded by the user';

-- Enable RLS
ALTER TABLE public.session_documents ENABLE ROW LEVEL SECURITY;

-- Create policies
-- Users can view documents for sessions they have access to
CREATE POLICY "Users can view their session documents"
    ON public.session_documents
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.schedule_sessions s
            WHERE s.id = session_documents.session_id
            AND (
                s.provider_id = auth.uid()
                OR s.assigned_to_specialist_id = auth.uid()
                OR s.assigned_to_sea_id = auth.uid()
            )
        )
    );

-- Users can insert documents for sessions they have access to
CREATE POLICY "Users can create documents for their sessions"
    ON public.session_documents
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.schedule_sessions s
            WHERE s.id = session_documents.session_id
            AND (
                s.provider_id = auth.uid()
                OR s.assigned_to_specialist_id = auth.uid()
                OR s.assigned_to_sea_id = auth.uid()
            )
        )
        AND created_by = auth.uid()
    );

-- Users can update their own documents
CREATE POLICY "Users can update their own documents"
    ON public.session_documents
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
    ON public.session_documents
    FOR DELETE
    USING (created_by = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_session_documents_session_id ON public.session_documents(session_id);
CREATE INDEX idx_session_documents_created_by ON public.session_documents(created_by);
