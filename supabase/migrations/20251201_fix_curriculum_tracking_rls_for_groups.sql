-- Fix RLS policies for curriculum_tracking to support group-based tracking
-- Current policies only check session_id, but we also need to support group_id

-- Drop existing policies
DROP POLICY IF EXISTS "Providers can view their own curriculum tracking" ON curriculum_tracking;
DROP POLICY IF EXISTS "Providers can insert their own curriculum tracking" ON curriculum_tracking;
DROP POLICY IF EXISTS "Providers can update their own curriculum tracking" ON curriculum_tracking;
DROP POLICY IF EXISTS "Providers can delete their own curriculum tracking" ON curriculum_tracking;

-- Create new policies that support both session_id and group_id

-- SELECT policy
CREATE POLICY "Providers can view their own curriculum tracking" ON curriculum_tracking
FOR SELECT USING (
  -- Session-based: user owns the session
  (session_id IS NOT NULL AND session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  ))
  OR
  -- Group-based: user owns any session in the group
  (group_id IS NOT NULL AND group_id IN (
    SELECT DISTINCT group_id FROM schedule_sessions
    WHERE group_id IS NOT NULL
      AND (provider_id = auth.uid()
           OR assigned_to_specialist_id = auth.uid()
           OR assigned_to_sea_id = auth.uid())
  ))
);

-- INSERT policy
CREATE POLICY "Providers can insert their own curriculum tracking" ON curriculum_tracking
FOR INSERT WITH CHECK (
  -- Session-based: user owns the session
  (session_id IS NOT NULL AND session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  ))
  OR
  -- Group-based: user owns any session in the group
  (group_id IS NOT NULL AND group_id IN (
    SELECT DISTINCT group_id FROM schedule_sessions
    WHERE group_id IS NOT NULL
      AND (provider_id = auth.uid()
           OR assigned_to_specialist_id = auth.uid()
           OR assigned_to_sea_id = auth.uid())
  ))
);

-- UPDATE policy
CREATE POLICY "Providers can update their own curriculum tracking" ON curriculum_tracking
FOR UPDATE USING (
  -- Session-based: user owns the session
  (session_id IS NOT NULL AND session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  ))
  OR
  -- Group-based: user owns any session in the group
  (group_id IS NOT NULL AND group_id IN (
    SELECT DISTINCT group_id FROM schedule_sessions
    WHERE group_id IS NOT NULL
      AND (provider_id = auth.uid()
           OR assigned_to_specialist_id = auth.uid()
           OR assigned_to_sea_id = auth.uid())
  ))
);

-- DELETE policy
CREATE POLICY "Providers can delete their own curriculum tracking" ON curriculum_tracking
FOR DELETE USING (
  -- Session-based: user owns the session
  (session_id IS NOT NULL AND session_id IN (
    SELECT id FROM schedule_sessions
    WHERE provider_id = auth.uid()
       OR assigned_to_specialist_id = auth.uid()
       OR assigned_to_sea_id = auth.uid()
  ))
  OR
  -- Group-based: user owns any session in the group
  (group_id IS NOT NULL AND group_id IN (
    SELECT DISTINCT group_id FROM schedule_sessions
    WHERE group_id IS NOT NULL
      AND (provider_id = auth.uid()
           OR assigned_to_specialist_id = auth.uid()
           OR assigned_to_sea_id = auth.uid())
  ))
);
