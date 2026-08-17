-- SPE-439: iep_meetings / iep_meeting_attendees granted UPDATE and DELETE to
-- every authenticated account sharing the school, with no owner or role test:
--
--   USING (school_id IN (SELECT school_id FROM get_my_school_ids()))
--
-- so any provider, teacher or admin at the school could permanently HARD-delete
-- another staff member's IEP meeting, or rewrite it, through a direct PostgREST
-- call. The app's cancelMeeting filters on organizer_id client-side, but that is
-- UX, not an authorization boundary.
--
-- The table was designed for soft delete (deleted_at, 20260708 line 57) and the
-- RLS layer contradicted its own schema. Worth stating plainly: IEP meetings are
-- compliance records for a FERPA-scoped product, and permanent destruction was
-- one unauthenticated-intent API call away.
--
-- WHAT THIS CHANGES
--
-- 1. UPDATE is narrowed to the organizer or a school admin, and gains a
--    WITH CHECK it never had. Without one, a permitted writer could move a row
--    to another school (out of their own scope) or hand it to a different
--    organizer — the USING clause only gates which rows you may touch, never
--    what you may turn them into.
--
-- 2. DELETE is REVOKED outright rather than re-scoped. Verified first: there is
--    no `.delete()` call site against either table anywhere in app/ or lib/, and
--    nothing ever writes deleted_at — the product's "remove" affordance is
--    cancelMeeting setting status='cancelled', which is the right behavior for a
--    compliance record anyway. Revoking beats a narrower policy here because it
--    removes the capability instead of trusting a predicate, and beats the
--    SECURITY DEFINER soft-delete RPC the ticket floated (PR #672's chat pattern)
--    because nothing needs to call one.
--
-- 3. Attendee INSERT is narrowed the same way. It is the same hole one verb over:
--    the parent-meeting scope test let anyone at the school attach themselves —
--    or anyone else — to a colleague's meeting. The legitimate flow is unaffected:
--    reserveMeetings inserts attendee rows immediately after inserting the
--    meetings with organizer_id = the caller (lib/supabase/queries/iep-meetings.ts).
--
-- 4. Both write policies gain the student-school binding the table never had.
--    Caught by the real-session probe, not by reading the policy: the first cut
--    of the WITH CHECK above passed its own logic and still let the organizer
--    move a Cedar student's meeting to Willow, because Tomás belongs to both
--    schools. Nothing tied the meeting to where the STUDENT is enrolled — on
--    INSERT either, so the UPDATE guard alone would have been bypassable by
--    creating the row wrong in the first place. Same binding the sibling
--    constraint tables carry (student_blocked_times, SPE-492 v2 lesson).
--
-- SELECT is deliberately untouched. Narrowing who can READ a school's meetings is
-- a real question but a separate one, tracked as SPE-369.
--
-- Both tables are empty in production (0 rows each, checked before applying), so
-- no existing row changes hands.

BEGIN;

-- ---------------------------------------------------------------------------
-- Helper: is the caller an admin over this school?
--
-- Same rule as the SPE-511 gate on copy_schedule_to_year — site_admin matches
-- its own school, district_admin matches any school in its district, resolved
-- through schools.district_id. Factored out because SPE-511's lesson was that an
-- inlined gate gets dropped when the surrounding statement is rewritten; a named
-- function is harder to lose silently and gives the rule one home.
--
-- SECURITY DEFINER: admin_permissions has its own restrictive RLS (a caller can
-- read only their own rows), which would otherwise make this return false for
-- exactly the district admins it is meant to admit. STABLE so the planner may
-- cache it within a statement. district_tech is excluded on purpose — an
-- integrations role, not a scheduling one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM admin_permissions ap
    WHERE ap.admin_id = (SELECT auth.uid())
      AND (
        (ap.role = 'site_admin' AND ap.school_id = p_school_id)
        OR (
          ap.role = 'district_admin'
          AND ap.district_id IS NOT NULL
          AND ap.district_id = (SELECT s.district_id FROM schools s WHERE s.id = p_school_id)
        )
      )
  );
$$;

COMMENT ON FUNCTION public.is_school_admin(text) IS
  'SPE-439: true when the caller holds site_admin over this school or district_admin over its district. Mirrors the SPE-511 copy_schedule_to_year gate. SECURITY DEFINER because admin_permissions RLS would otherwise hide a district admin''s own grant from this check.';

REVOKE ALL ON FUNCTION public.is_school_admin(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_school_admin(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- iep_meetings: UPDATE narrowed to organizer or school admin, plus a WITH CHECK
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "iep_meetings_update" ON public.iep_meetings;
CREATE POLICY "iep_meetings_update"
ON public.iep_meetings
FOR UPDATE
TO authenticated
USING (
  (school_id)::text IN (SELECT school_id FROM get_my_school_ids())
  AND (
    organizer_id = (SELECT auth.uid())
    OR public.is_school_admin((school_id)::text)
  )
)
WITH CHECK (
  (school_id)::text IN (SELECT school_id FROM get_my_school_ids())
  AND (
    organizer_id = (SELECT auth.uid())
    OR public.is_school_admin((school_id)::text)
  )
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = iep_meetings.student_id
      AND (s.school_id)::text = (iep_meetings.school_id)::text
  )
);

COMMENT ON POLICY "iep_meetings_update" ON public.iep_meetings IS
  'SPE-439: the organizer or a school admin only. WITH CHECK mirrors USING so a permitted writer cannot move the meeting to another school or reassign it to a different organizer.';

-- ---------------------------------------------------------------------------
-- iep_meetings: INSERT keeps its organizer rule and gains the same binding
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "iep_meetings_insert" ON public.iep_meetings;
CREATE POLICY "iep_meetings_insert"
ON public.iep_meetings
FOR INSERT
TO authenticated
WITH CHECK (
  organizer_id = (SELECT auth.uid())
  AND (school_id)::text IN (SELECT school_id FROM get_my_school_ids())
  AND EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = iep_meetings.student_id
      AND (s.school_id)::text = (iep_meetings.school_id)::text
  )
);

COMMENT ON POLICY "iep_meetings_insert" ON public.iep_meetings IS
  'SPE-439: unchanged organizer rule, plus the student-school binding — a meeting cannot be filed under a school the student is not enrolled at.';

-- ---------------------------------------------------------------------------
-- iep_meeting_attendees: UPDATE and INSERT inherit the parent meeting's rule
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "iep_meeting_attendees_update" ON public.iep_meeting_attendees;
CREATE POLICY "iep_meeting_attendees_update"
ON public.iep_meeting_attendees
FOR UPDATE
TO authenticated
USING (
  meeting_id IN (
    SELECT m.id FROM iep_meetings m
    WHERE (m.school_id)::text IN (SELECT school_id FROM get_my_school_ids())
      AND (
        m.organizer_id = (SELECT auth.uid())
        OR public.is_school_admin((m.school_id)::text)
      )
  )
)
WITH CHECK (
  meeting_id IN (
    SELECT m.id FROM iep_meetings m
    WHERE (m.school_id)::text IN (SELECT school_id FROM get_my_school_ids())
      AND (
        m.organizer_id = (SELECT auth.uid())
        OR public.is_school_admin((m.school_id)::text)
      )
  )
);

DROP POLICY IF EXISTS "iep_meeting_attendees_insert" ON public.iep_meeting_attendees;
CREATE POLICY "iep_meeting_attendees_insert"
ON public.iep_meeting_attendees
FOR INSERT
TO authenticated
WITH CHECK (
  meeting_id IN (
    SELECT m.id FROM iep_meetings m
    WHERE (m.school_id)::text IN (SELECT school_id FROM get_my_school_ids())
      AND (
        m.organizer_id = (SELECT auth.uid())
        OR public.is_school_admin((m.school_id)::text)
      )
  )
);

COMMENT ON POLICY "iep_meeting_attendees_insert" ON public.iep_meeting_attendees IS
  'SPE-439: only the parent meeting''s organizer or a school admin may add attendees — previously any account sharing the school could attach itself to a colleague''s meeting.';

-- ---------------------------------------------------------------------------
-- DELETE: remove the capability rather than re-scope it (see note 2 above).
-- The policies go too, so a future GRANT cannot silently re-open the hole
-- against a permissive leftover policy.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "iep_meetings_delete" ON public.iep_meetings;
DROP POLICY IF EXISTS "iep_meeting_attendees_delete" ON public.iep_meeting_attendees;

REVOKE DELETE ON public.iep_meetings FROM authenticated, anon;
REVOKE DELETE ON public.iep_meeting_attendees FROM authenticated, anon;

-- While here: both tables carried Supabase's default GRANT ALL, so `anon` held
-- INSERT/UPDATE/TRUNCATE and `authenticated` held TRUNCATE. Every policy on
-- these tables is TO authenticated, so anon has no policy and PostgREST already
-- refuses it — but TRUNCATE is NOT subject to row-level security at all, and
-- "the grant is harmless because a policy covers it" is exactly the reasoning
-- that makes a later policy edit load-bearing in a way nobody notices.
--
-- Scoped to these two tables deliberately. The same default grant is on 68 of 72
-- public tables (anon TRUNCATE) and 66 (anon DELETE) — a real defense-in-depth
-- gap, already tracked as SPE-142, and a 72-table sweep does not belong inside
-- this ticket's blast radius.
REVOKE INSERT, UPDATE, TRUNCATE ON public.iep_meetings FROM anon;
REVOKE INSERT, UPDATE, TRUNCATE ON public.iep_meeting_attendees FROM anon;
REVOKE TRUNCATE ON public.iep_meetings FROM authenticated;
REVOKE TRUNCATE ON public.iep_meeting_attendees FROM authenticated;

COMMENT ON TABLE public.iep_meetings IS
  'IEP meetings (SPE-203). Compliance records: clients hold no DELETE grant (SPE-439) — cancellation is status=''cancelled'', and deleted_at is reserved for a service-role retention path. UPDATE is organizer-or-school-admin.';

COMMIT;
