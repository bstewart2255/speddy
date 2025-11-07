-- Migrate existing documents from group_documents and session_documents to unified documents table

-- Migrate group_documents to documents table with documentable_type='group'
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

-- Migrate session_documents to documents table with documentable_type='session'
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
