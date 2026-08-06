-- SPE-399: stop users from granting themselves school scope.
--
-- `provider_schools` gated all three write commands on nothing but ownership:
--
--   INSERT ... WITH CHECK (provider_id = auth.uid())
--   UPDATE ... USING      (provider_id = auth.uid())   -- no WITH CHECK at all
--   DELETE ... USING      (provider_id = auth.uid())
--
-- "It's my row" is not authorization here, because this table IS the
-- authorization. `get_my_school_ids()` returns
-- `profiles.school_id UNION provider_schools.school_id WHERE provider_id = auth.uid()`,
-- so a single self-inserted row silently widens the caller's school scope and
-- unlocks every policy written against that union — care_referrals, care_cases,
-- care_action_items, care_meeting_notes, iep_meetings, student_parent_contacts,
-- site_meeting_rules, special_activities, teacher_availability_prefs, and the
-- school branch of profiles_select.
--
-- Reproduced against live RLS before writing this: a district_tech went from 0
-- to 4 readable care_referrals with one insert, and a teacher and an SEA could
-- both self-attach to a school they have no relationship with. The UPDATE path
-- was equally open — omitting WITH CHECK makes Postgres reuse USING, which
-- constrains provider_id but leaves school_id free to be rewritten.
--
-- Compare `profiles`, where `profiles_guard_immutable_columns()` already blocks
-- self-writes to role / is_speddy_admin / school_id / district_id. This was the
-- unguarded back door to the same escalation.
--
-- WHY DENYING OUTRIGHT IS SAFE (verified, not assumed):
--   * Both application writers — app/api/admin/district/providers/route.ts and
--     .../providers/[providerId]/route.ts — use the service-role client, and
--     service_role has rolbypassrls = true.
--   * Signup writes rows via handle_new_user_schools(), a SECURITY DEFINER
--     trigger owned by postgres; provider_schools is owned by postgres with
--     relforcerowsecurity = false, so that path bypasses RLS too.
--   * Every other reference in app/ and lib/ is a .select(). There is no
--     browser-side flow that inserts, updates or deletes here, and no
--     post-signup "add a school" UI — school assignments are an admin action.
--
-- Reads are untouched: providers still see their own rows, and site/district
-- admins still see their scope (provider_schools_select is unchanged).
--
-- Shape follows the existing precedent on admin_permissions ("Only service role
-- can update/delete admin permissions"), which pins the same intent with an
-- explicit false rather than by dropping the policy — a named policy states the
-- rule where a missing one just looks like an oversight.

DROP POLICY IF EXISTS provider_schools_insert ON public.provider_schools;
CREATE POLICY provider_schools_insert
ON public.provider_schools
FOR INSERT
TO public
WITH CHECK (false);

DROP POLICY IF EXISTS provider_schools_update ON public.provider_schools;
CREATE POLICY provider_schools_update
ON public.provider_schools
FOR UPDATE
TO public
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS provider_schools_delete ON public.provider_schools;
CREATE POLICY provider_schools_delete
ON public.provider_schools
FOR DELETE
TO public
USING (false);

COMMENT ON TABLE public.provider_schools
IS 'Which schools each provider serves. This table IS an authorization input (get_my_school_ids), so it is admin/service-role-writable only — never self-writable. See SPE-399.';
