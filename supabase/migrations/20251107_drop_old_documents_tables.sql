-- Drop old document tables now that data has been migrated to unified documents table

-- Drop old group_documents table
DROP TABLE IF EXISTS public.group_documents CASCADE;

-- Drop old session_documents table
DROP TABLE IF EXISTS public.session_documents CASCADE;

-- Note: Storage bucket cleanup should be done carefully via Supabase dashboard or API
-- to ensure files are migrated/backed up first. The old buckets are:
-- - 'group-documents'
-- - 'session-documents'
-- These can be removed once all files have been moved to the new 'documents' bucket.
