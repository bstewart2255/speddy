-- Fix account creation: find_school_ids_by_names could not resolve similarity()
-- (pg_trgm lives in the `extensions` schema) because its search_path was locked to
-- 'public' by an earlier hardening migration. This broke create_profile_for_new_user
-- with: "function similarity(text, text) does not exist" — surfaced while onboarding a
-- district admin (SPE-281).
--
-- Add `extensions` back to the function's search_path so the pg_trgm fuzzy-match
-- calls resolve, while keeping an explicit (non-default) search_path.
-- create_profile_for_new_user needs no change (it does not call similarity() directly).
-- Applied to production 2026-07-20.

ALTER FUNCTION public.find_school_ids_by_names(text, text, text)
  SET search_path TO public, extensions;
