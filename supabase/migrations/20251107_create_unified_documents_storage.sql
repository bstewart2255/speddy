-- Create unified storage bucket for all documents (groups and sessions)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'documents',
    'documents',
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

-- Create storage policies for unified documents bucket
-- Policy for uploading documents (groups or sessions)
CREATE POLICY "Users can upload documents"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'documents'
        AND auth.role() = 'authenticated'
        AND (
            -- Allow uploads to groups/ folder
            (storage.foldername(name))[1] = 'groups'
            OR
            -- Allow uploads to sessions/ folder
            (storage.foldername(name))[1] = 'sessions'
        )
    );

-- Policy for viewing documents
CREATE POLICY "Users can view documents"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'documents'
        AND auth.role() = 'authenticated'
    );

-- Policy for deleting documents
CREATE POLICY "Users can delete documents"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'documents'
        AND auth.role() = 'authenticated'
    );
