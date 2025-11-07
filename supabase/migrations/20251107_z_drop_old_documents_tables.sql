-- Drop old document tables now that data has been migrated to unified documents table
-- Includes row count verification to ensure data migration succeeded before dropping tables

DO $$
DECLARE
    group_count_old integer;
    group_count_new integer;
    session_count_old integer;
    session_count_new integer;
BEGIN
    -- Check if old tables exist before counting
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'group_documents') THEN
        -- Compare row counts for group_documents
        SELECT COUNT(*) INTO group_count_old FROM public.group_documents;
        SELECT COUNT(*) INTO group_count_new FROM public.documents WHERE documentable_type = 'group';

        IF group_count_old <> group_count_new THEN
            RAISE EXCEPTION 'Row count mismatch for group_documents: old=%, new=%', group_count_old, group_count_new;
        END IF;

        -- Drop old group_documents table
        DROP TABLE public.group_documents CASCADE;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'session_documents') THEN
        -- Compare row counts for session_documents
        SELECT COUNT(*) INTO session_count_old FROM public.session_documents;
        SELECT COUNT(*) INTO session_count_new FROM public.documents WHERE documentable_type = 'session';

        IF session_count_old <> session_count_new THEN
            RAISE EXCEPTION 'Row count mismatch for session_documents: old=%, new=%', session_count_old, session_count_new;
        END IF;

        -- Drop old session_documents table
        DROP TABLE public.session_documents CASCADE;
    END IF;
END $$;

-- IMPORTANT: Storage bucket cleanup
--
-- DO NOT DELETE the old storage buckets yet! The old buckets contain actual files:
-- - 'group-documents' bucket
-- - 'session-documents' bucket
--
-- These buckets must remain until files are migrated to the new 'documents' bucket.
-- The download API has backward compatibility to fetch from legacy buckets.
--
-- Steps for eventual complete migration:
-- 1. ✅ Database records migrated (this script)
-- 2. ⏳ Files still in old buckets (download route handles this)
-- 3. 🔄 Gradually migrate files using Supabase Storage API
-- 4. 📝 Update file_path values to use new structure (groups/{id}/ or sessions/{id}/)
-- 5. 🗑️ Once all files migrated and paths updated, buckets can be safely deleted
--
-- Until then: KEEP old storage buckets to avoid breaking existing file downloads!
