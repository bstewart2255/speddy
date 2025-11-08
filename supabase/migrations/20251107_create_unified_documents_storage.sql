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
            (
                -- Allow uploads to groups/ folder if user has access to the group
                (storage.foldername(name))[1] = 'groups'
                AND EXISTS (
                    SELECT 1
                    FROM public.schedule_sessions s
                    WHERE s.group_id = ((storage.foldername(name))[2])::uuid
                      AND (
                        s.provider_id = auth.uid()
                        OR s.assigned_to_specialist_id = auth.uid()
                        OR s.assigned_to_sea_id = auth.uid()
                      )
                    LIMIT 1
                )
            )
            OR (
                -- Allow uploads to sessions/ folder if user has access to the session
                (storage.foldername(name))[1] = 'sessions'
                AND EXISTS (
                    SELECT 1
                    FROM public.schedule_sessions s
                    WHERE s.id = ((storage.foldername(name))[2])::uuid
                      AND (
                        s.provider_id = auth.uid()
                        OR s.assigned_to_specialist_id = auth.uid()
                        OR s.assigned_to_sea_id = auth.uid()
                      )
                    LIMIT 1
                )
            )
        )
    );

-- Policy for viewing documents
CREATE POLICY "Users can view documents"
    ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'documents'
        AND EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.file_path = name
              AND (
                (
                  d.documentable_type = 'group'
                  AND EXISTS (
                    SELECT 1
                    FROM public.schedule_sessions s
                    WHERE s.group_id = d.documentable_id
                      AND (
                        s.provider_id = auth.uid()
                        OR s.assigned_to_specialist_id = auth.uid()
                        OR s.assigned_to_sea_id = auth.uid()
                      )
                    LIMIT 1
                  )
                )
                OR (
                  d.documentable_type = 'session'
                  AND EXISTS (
                    SELECT 1
                    FROM public.schedule_sessions s
                    WHERE s.id = d.documentable_id
                      AND (
                        s.provider_id = auth.uid()
                        OR s.assigned_to_specialist_id = auth.uid()
                        OR s.assigned_to_sea_id = auth.uid()
                      )
                    LIMIT 1
                  )
                )
              )
        )
    );

-- Policy for deleting documents
CREATE POLICY "Users can delete documents"
    ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'documents'
        AND EXISTS (
            SELECT 1
            FROM public.documents d
            WHERE d.file_path = name
              AND d.created_by = auth.uid()
        )
    );
