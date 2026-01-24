-- Add session_date column to documents table for per-instance document scoping
-- This allows documents to be attached to specific session instances rather than
-- being shared across all instances of a recurring session/group

ALTER TABLE public.documents 
ADD COLUMN IF NOT EXISTS session_date DATE;

-- Add index for efficient queries by session_date
CREATE INDEX IF NOT EXISTS idx_documents_session_date 
ON public.documents(documentable_type, documentable_id, session_date);

-- Add comment explaining the column
COMMENT ON COLUMN public.documents.session_date IS 'Date of the session instance this document belongs to. NULL for legacy documents or documents shared across all instances.';
