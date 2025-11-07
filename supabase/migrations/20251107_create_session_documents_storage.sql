-- Create storage bucket for session documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'session-documents',
    'session-documents',
    false,
    26214400, -- 25MB limit
    ARRAY[
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
        'text/csv'
    ]
)
ON CONFLICT (id) DO NOTHING;

-- Create storage policies for session documents
CREATE POLICY "Users can upload session documents"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'session-documents'
        AND auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = 'sessions'
    );

CREATE POLICY "Users can view their session documents"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'session-documents'
        AND auth.role() = 'authenticated'
    );

CREATE POLICY "Users can delete their session documents"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'session-documents'
        AND auth.role() = 'authenticated'
    );
