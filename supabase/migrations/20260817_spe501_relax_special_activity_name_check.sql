-- SPE-501: special_activities_activity_name_check allow-listed seven activity
-- names ('Library','STEAM','STEM','Garden','Music','ART','PE') while the admin
-- master-schedule form offers an explicit "Other..." option with a free-text
-- box (create-item-modal.tsx:1021,1028). The product deliberately invites a
-- custom name and the database refused it — schools run Band, Choir, Computers,
-- Drama, Spanish, Assembly, Adaptive PE, none of which could ever be saved.
--
-- The twin of SPE-491, which hit the same wall on bell_schedules the same night
-- and widened that allow-list. Widening is the wrong shape HERE, though: an
-- enum cannot enclose a free-text field, so a longer list would just move the
-- cliff. Replaced with the shape used for the equivalent free-text column on
-- student_blocked_times.label (SPE-492) — non-blank, bounded.
--
-- The 100-char bound is a storage/abuse guard, not a vocabulary: activity_name
-- renders inside schedule bands and conflict warnings, where anything near that
-- length is already unreadable. The client validates the same rule first, so
-- the constraint is a backstop rather than the user's error message.
--
-- Strictly additive against existing data — verified before applying: 206 rows,
-- 184 with a non-null activity_name, zero blank/whitespace-only, max length 7.
-- Every previously-legal value stays legal, so no existing row can violate it.

ALTER TABLE public.special_activities
  DROP CONSTRAINT special_activities_activity_name_check;

ALTER TABLE public.special_activities
  ADD CONSTRAINT special_activities_activity_name_check CHECK (
    activity_name IS NULL
    OR (length(btrim(activity_name)) > 0 AND length(activity_name) <= 100)
  );

COMMENT ON CONSTRAINT special_activities_activity_name_check ON public.special_activities IS
  'SPE-501: activity_name is free text (the admin form offers "Other..."), so this bounds it rather than enumerating it — non-blank when present, at most 100 chars. SPECIAL_ACTIVITY_TYPES remains the suggested picklist in the UI, not the permitted set.';
