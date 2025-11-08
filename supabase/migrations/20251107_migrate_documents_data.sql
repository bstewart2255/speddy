-- Migrate existing documents from group_documents and session_documents to unified documents table
--
-- IMPORTANT: This migration only moves database records, NOT the actual files in storage.
-- Files remain in the old buckets (group-documents, session-documents) for backward compatibility.
-- The download API has been updated to check legacy buckets for old files.
--
-- To fully migrate to the new unified bucket:
-- 1. Run this database migration
-- 2. New file uploads will use the new 'documents' bucket with proper folder structure
-- 3. Old files will continue to work via legacy bucket fallback in download route
-- 4. Optionally, files can be manually migrated to the new bucket later using Supabase Storage API
--    and the file_path values updated to include 'groups/{id}/' or 'sessions/{id}/' prefix

-- Migrate group_documents to documents table with documentable_type='group'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'group_documents'
    ) THEN
        INSERT INTO public.documents (
            id,
            documentable_type,
            documentable_id,
            title,
            document_type,
            content,
            url,
            file_path,
            mime_type,
            file_size,
            original_filename,
            created_by,
            created_at,
            updated_at
        )
        SELECT
            id,
            'group' as documentable_type,
            group_id as documentable_id,
            title,
            document_type,
            content,
            url,
            file_path,
            mime_type,
            file_size,
            original_filename,
            created_by,
            created_at,
            updated_at
        FROM public.group_documents
        ON CONFLICT (id) DO NOTHING;
    END IF;
END
$$;

-- Migrate session_documents to documents table with documentable_type='session'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_documents'
    ) THEN
        INSERT INTO public.documents (
            id,
            documentable_type,
            documentable_id,
            title,
            document_type,
            content,
            url,
            file_path,
            mime_type,
            file_size,
            original_filename,
            created_by,
            created_at,
            updated_at
        )
        SELECT
            id,
            'session' as documentable_type,
            session_id as documentable_id,
            title,
            document_type,
            content,
            url,
            file_path,
            mime_type,
            file_size,
            original_filename,
            created_by,
            created_at,
            updated_at
        FROM public.session_documents
        ON CONFLICT (id) DO NOTHING;
    END IF;
END
$$;
