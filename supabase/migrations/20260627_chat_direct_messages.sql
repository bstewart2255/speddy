-- SPE-198 (Phase 2): direct messages (1:1, same-site).
--
-- Builds on the Phase 0 scaffolding: conversations.dm_key + the partial unique
-- index ux_conversations_dm_key (type='direct') for dedupe, the
-- conversation_participants table (DM-only, INSERT not granted to authenticated),
-- and can_access_conversation which already gates 'direct' on participant rows.
--
-- All writes go through SECURITY DEFINER RPCs (the sole DM write path), mirroring
-- open_student_conversation. Idempotent (CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- 1. Authorization-layer exclusions: district admins, like SEAs, have no chat
--    surface (§4). Enforce that in is_chat_eligible so they can never be a
--    participant of ANY conversation, not just be hidden in the UI.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_chat_eligible(p_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_uid AND p.role NOT IN ('sea', 'district_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. chat_shares_site(a, b): do two people share at least one school? A person's
--    schools are the union of provider_schools (multi-school providers),
--    profiles.school_id, and their site_admin admin_permissions grants.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chat_shares_site(p_a uuid, p_b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH a AS (
    SELECT ps.school_id FROM public.provider_schools ps WHERE ps.provider_id = p_a AND ps.school_id IS NOT NULL
    UNION SELECT pr.school_id FROM public.profiles pr WHERE pr.id = p_a AND pr.school_id IS NOT NULL
    UNION SELECT ap.school_id FROM public.admin_permissions ap
      WHERE ap.admin_id = p_a AND ap.role = 'site_admin' AND ap.school_id IS NOT NULL
  ),
  b AS (
    SELECT ps.school_id FROM public.provider_schools ps WHERE ps.provider_id = p_b AND ps.school_id IS NOT NULL
    UNION SELECT pr.school_id FROM public.profiles pr WHERE pr.id = p_b AND pr.school_id IS NOT NULL
    UNION SELECT ap.school_id FROM public.admin_permissions ap
      WHERE ap.admin_id = p_b AND ap.role = 'site_admin' AND ap.school_id IS NOT NULL
  )
  SELECT EXISTS (SELECT 1 FROM a JOIN b USING (school_id));
$$;

-- Internal helper only — called by open_direct_conversation (as owner). It is
-- SECURITY DEFINER and reads profiles/provider_schools/admin_permissions, so it
-- must NOT be directly callable by clients (a caller could otherwise probe
-- whether two profile UUIDs share a school). Lock it out of the exposed API.
REVOKE EXECUTE ON FUNCTION public.chat_shares_site(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.chat_shares_site(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. get_dm_eligible_people(p_school_id): people the caller can start a DM with
--    at a given school. Scoped to the active school (the picker is school-scoped
--    like the Phase 1 student picker). The caller must themselves be a member of
--    p_school_id, so this can't be used to enumerate an arbitrary school's staff.
--    Excludes the caller, SEAs, and district admins (via is_chat_eligible).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_dm_eligible_people(p_school_id varchar)
RETURNS TABLE(id uuid, full_name text, role text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH caller_schools AS (
    SELECT ps.school_id FROM public.provider_schools ps WHERE ps.provider_id = auth.uid() AND ps.school_id IS NOT NULL
    UNION SELECT pr.school_id FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.school_id IS NOT NULL
    UNION SELECT ap.school_id FROM public.admin_permissions ap
      WHERE ap.admin_id = auth.uid() AND ap.role = 'site_admin' AND ap.school_id IS NOT NULL
  ),
  members AS (
    SELECT ps.provider_id AS pid FROM public.provider_schools ps WHERE ps.school_id = p_school_id
    UNION SELECT pr.id FROM public.profiles pr WHERE pr.school_id = p_school_id
    UNION SELECT ap.admin_id FROM public.admin_permissions ap
      WHERE ap.school_id = p_school_id AND ap.role = 'site_admin'
  )
  SELECT p.id, p.full_name, p.role
  FROM public.profiles p
  JOIN members m ON m.pid = p.id
  WHERE public.is_chat_eligible(auth.uid())
    AND p_school_id IN (SELECT school_id FROM caller_schools)
    AND p.id <> auth.uid()
    AND public.is_chat_eligible(p.id)
  ORDER BY p.full_name, p.id;
$$;

REVOKE EXECUTE ON FUNCTION public.get_dm_eligible_people(varchar) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dm_eligible_people(varchar) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. open_direct_conversation(p_other_id): the sole DM write path. Validates
--    both people are chat-eligible and share a site, dedupes on a normalized
--    dm_key (sorted uuid pair) via the unique index, creates the conversation
--    and exactly two participant rows, and returns the conversation id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.open_direct_conversation(p_other_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_dm_key text;
  v_school_id varchar;
  v_conversation_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;
  IF p_other_id IS NULL OR p_other_id = v_uid THEN
    RAISE EXCEPTION 'Invalid recipient' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_chat_eligible(v_uid) THEN
    RAISE EXCEPTION 'Not eligible for chat' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_chat_eligible(p_other_id) THEN
    RAISE EXCEPTION 'Recipient is not eligible for chat' USING ERRCODE = '42501';
  END IF;
  IF NOT public.chat_shares_site(v_uid, p_other_id) THEN
    RAISE EXCEPTION 'You can only message people who share a site with you' USING ERRCODE = '42501';
  END IF;

  -- Normalized pair key so (A,B) and (B,A) map to one conversation.
  v_dm_key := least(v_uid, p_other_id)::text || ':' || greatest(v_uid, p_other_id)::text;

  SELECT id INTO v_conversation_id
  FROM public.conversations
  WHERE type = 'direct' AND dm_key = v_dm_key;
  IF v_conversation_id IS NOT NULL THEN
    RETURN v_conversation_id;
  END IF;

  -- A shared school for scope/cleanup.
  WITH a AS (
    SELECT ps.school_id FROM public.provider_schools ps WHERE ps.provider_id = v_uid AND ps.school_id IS NOT NULL
    UNION SELECT pr.school_id FROM public.profiles pr WHERE pr.id = v_uid AND pr.school_id IS NOT NULL
    UNION SELECT ap.school_id FROM public.admin_permissions ap
      WHERE ap.admin_id = v_uid AND ap.role = 'site_admin' AND ap.school_id IS NOT NULL
  ),
  b AS (
    SELECT ps.school_id FROM public.provider_schools ps WHERE ps.provider_id = p_other_id AND ps.school_id IS NOT NULL
    UNION SELECT pr.school_id FROM public.profiles pr WHERE pr.id = p_other_id AND pr.school_id IS NOT NULL
    UNION SELECT ap.school_id FROM public.admin_permissions ap
      WHERE ap.admin_id = p_other_id AND ap.role = 'site_admin' AND ap.school_id IS NOT NULL
  )
  SELECT a.school_id INTO v_school_id FROM a JOIN b USING (school_id) LIMIT 1;

  INSERT INTO public.conversations (type, dm_key, school_id, created_by)
  VALUES ('direct', v_dm_key, v_school_id, v_uid)
  ON CONFLICT (dm_key) WHERE (type = 'direct')
  DO NOTHING
  RETURNING id INTO v_conversation_id;

  -- Lost a create race: re-read the winner.
  IF v_conversation_id IS NULL THEN
    SELECT id INTO v_conversation_id
    FROM public.conversations
    WHERE type = 'direct' AND dm_key = v_dm_key;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, profile_id)
  VALUES (v_conversation_id, v_uid), (v_conversation_id, p_other_id)
  ON CONFLICT (conversation_id, profile_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.open_direct_conversation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_direct_conversation(uuid) TO authenticated, service_role;
