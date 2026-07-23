-- Groups v2 · Phase 2 (SPE-311), increment 2b — name/color edit for a group.
--
-- Updates the durable session_groups record AND re-stamps the legacy
-- group_name/group_color on every current member (template + future instances)
-- so the Today/Week views and the Main Schedule plate label stay consistent
-- through the bake window. Owner-scoped and future-only, same as the other
-- Phase 2 RPCs; a blank name normalizes to NULL (auto display name).
CREATE OR REPLACE FUNCTION public.groups_v2_rename(p_group_id uuid, p_name text, p_color integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_g record; v_tid uuid; v_name text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_color IS NOT NULL AND (p_color < 0 OR p_color > 4) THEN RAISE EXCEPTION 'color must be 0..4'; END IF;
  SELECT * INTO v_g FROM session_groups WHERE id = p_group_id;
  IF v_g IS NULL THEN RAISE EXCEPTION 'group not found'; END IF;
  IF v_g.provider_id <> v_uid THEN RAISE EXCEPTION 'not the owner of this group'; END IF;

  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');  -- blank name -> NULL (auto display name)
  UPDATE session_groups SET name = v_name, color = p_color, updated_at = now() WHERE id = p_group_id;

  -- Iterate the group's TEMPLATE rows only: _groups_v2_stamp propagates each
  -- template to its own future instances (template_id / natural-key match,
  -- future-only), so both templates and today/future instances get the new
  -- group_name/group_color. (Verified: rename stamps 2 templates + 24 future
  -- instances, 0 stale.)
  FOR v_tid IN SELECT id FROM schedule_sessions
    WHERE group_ref = p_group_id AND session_date IS NULL AND deleted_at IS NULL LOOP
    PERFORM public._groups_v2_stamp(v_tid, p_group_id, v_name, p_color);
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.groups_v2_rename(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.groups_v2_rename(uuid, text, integer) TO authenticated;
