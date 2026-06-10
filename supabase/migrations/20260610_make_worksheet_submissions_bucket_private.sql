-- SPE-125: Make the worksheet-submissions storage bucket private.
--
-- The bucket holds photos of completed student worksheets (handwriting, and
-- sometimes names students write on the page) — FERPA-relevant educational
-- records. It was `public = true`, so every object was readable by anyone with
-- the URL, indefinitely, with no auth. SPE-12 (20260529) closed object LISTING
-- but objects stayed reachable via the public CDN URL
-- (/storage/v1/object/public/...). This makes the objects themselves private.
--
-- After this change, getPublicUrl() links stop resolving. That is intended:
--   * App code no longer stores or serves public URLs — the submit-worksheet
--     and email-webhook routes now persist the storage object PATH in
--     worksheet_submissions.image_url, and any future reader signs it on demand
--     with createSignedUrl() (the pattern already used by documents and
--     saved-worksheets).
--   * Nothing in the app currently renders image_url, so there is no in-app
--     read path to regress.
--
-- Upload/update/delete RLS policies on storage.objects are governed by RLS, not
-- the public flag, so they are unaffected.
--
-- Also add guardrails that were missing (file_size_limit was null, allowed_mime
-- _types was null): cap object size and restrict to image content types.
UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 10485760, -- 10 MB, matches the app-level image validation
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'worksheet-submissions';
