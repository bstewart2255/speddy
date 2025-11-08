-- Create unified polymorphic documents table to replace group_documents and session_documents
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Polymorphic association fields
    documentable_type TEXT NOT NULL CHECK (documentable_type IN ('group', 'session')),
    documentable_id UUID NOT NULL,

    -- Document metadata
    title TEXT NOT NULL,
    document_type TEXT NOT NULL CHECK (document_type IN ('pdf', 'link', 'note', 'file')),
    content TEXT,
    url TEXT,
    file_path TEXT,
    mime_type TEXT,
    file_size BIGINT,
    original_filename TEXT,

    -- Audit fields
    created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE public.documents IS 'Unified polymorphic documents table for groups and sessions (PDFs, links, notes, files)';
COMMENT ON COLUMN public.documents.documentable_type IS 'Type of parent entity: group or session';
COMMENT ON COLUMN public.documents.documentable_id IS 'ID of parent entity (group_id or session_id)';
COMMENT ON COLUMN public.documents.mime_type IS 'MIME type of the uploaded file (e.g., application/pdf, image/png)';
COMMENT ON COLUMN public.documents.file_size IS 'Size of the uploaded file in bytes';
COMMENT ON COLUMN public.documents.original_filename IS 'Original filename as uploaded by the user';

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create composite index for polymorphic queries
CREATE INDEX idx_documents_polymorphic ON public.documents(documentable_type, documentable_id);
CREATE INDEX idx_documents_created_by ON public.documents(created_by);

-- RLS Policy: Users can view documents for groups they have access to
CREATE POLICY "Users can view their group documents"
    ON public.documents
    FOR SELECT
    USING (
        documentable_type = 'group'
        AND EXISTS (
            SELECT 1 FROM public.schedule_sessions s
            WHERE s.group_id = documents.documentable_id
            AND (
                s.provider_id = auth.uid()
                OR s.assigned_to_specialist_id = auth.uid()
                OR s.assigned_to_sea_id = auth.uid()
            )
            LIMIT 1
        )
    );

-- RLS Policy: Users can view documents for sessions they have access to
CREATE POLICY "Users can view their session documents"
    ON public.documents
    FOR SELECT
    USING (
        documentable_type = 'session'
        AND EXISTS (
            SELECT 1 FROM public.schedule_sessions s
            WHERE s.id = documents.documentable_id
            AND (
                s.provider_id = auth.uid()
                OR s.assigned_to_specialist_id = auth.uid()
                OR s.assigned_to_sea_id = auth.uid()
            )
            LIMIT 1
        )
    );

-- RLS Policy: Users can create documents for groups they have access to
CREATE POLICY "Users can create documents for their groups"
    ON public.documents
    FOR INSERT
    WITH CHECK (
        documentable_type = 'group'
        AND EXISTS (
            SELECT 1 FROM public.schedule_sessions s
            WHERE s.group_id = documents.documentable_id
            AND (
                s.provider_id = auth.uid()
                OR s.assigned_to_specialist_id = auth.uid()
                OR s.assigned_to_sea_id = auth.uid()
            )
            LIMIT 1
        )
        AND created_by = auth.uid()
    );

-- RLS Policy: Users can create documents for sessions they have access to
CREATE POLICY "Users can create documents for their sessions"
    ON public.documents
    FOR INSERT
    WITH CHECK (
        documentable_type = 'session'
        AND EXISTS (
            SELECT 1 FROM public.schedule_sessions s
            WHERE s.id = documents.documentable_id
            AND (
                s.provider_id = auth.uid()
                OR s.assigned_to_specialist_id = auth.uid()
                OR s.assigned_to_sea_id = auth.uid()
            )
            LIMIT 1
        )
        AND created_by = auth.uid()
    );

-- RLS Policy: Users can update their own documents
CREATE POLICY "Users can update their own documents"
    ON public.documents
    FOR UPDATE
    USING (created_by = auth.uid())
    WITH CHECK (created_by = auth.uid());

-- RLS Policy: Users can delete their own documents
CREATE POLICY "Users can delete their own documents"
    ON public.documents
    FOR DELETE
    USING (created_by = auth.uid());
