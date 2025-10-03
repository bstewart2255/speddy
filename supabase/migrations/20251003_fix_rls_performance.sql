-- Fix RLS performance issues by wrapping auth functions in subqueries
-- This prevents re-evaluation of auth.uid() for each row

-- ==========================
-- CALENDAR EVENTS
-- ==========================

DROP POLICY IF EXISTS "Providers can create own calendar events" ON calendar_events;
CREATE POLICY "Providers can create own calendar events" ON calendar_events
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Providers can delete own calendar events" ON calendar_events;
CREATE POLICY "Providers can delete own calendar events" ON calendar_events
  FOR DELETE USING ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Providers can update own calendar events" ON calendar_events;
CREATE POLICY "Providers can update own calendar events" ON calendar_events
  FOR UPDATE USING ((SELECT auth.uid()) = provider_id)
  WITH CHECK ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Providers can view own calendar events" ON calendar_events;
DROP POLICY IF EXISTS "SEAs can view provider calendar events" ON calendar_events;
-- Consolidate into single policy to avoid multiple permissive policies
CREATE POLICY "Users can view calendar events" ON calendar_events
  FOR SELECT USING (
    (SELECT auth.uid()) = provider_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'sea'
        AND (
          (profiles.school_site = calendar_events.school_site AND calendar_events.school_site IS NOT NULL)
          OR (profiles.school_district = calendar_events.school_district AND calendar_events.school_district IS NOT NULL)
        )
    )
  );

-- ==========================
-- EXIT TICKETS
-- ==========================

DROP POLICY IF EXISTS "Providers can create exit tickets" ON exit_tickets;
CREATE POLICY "Providers can create exit tickets" ON exit_tickets
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Providers can delete own exit tickets" ON exit_tickets;
CREATE POLICY "Providers can delete own exit tickets" ON exit_tickets
  FOR DELETE USING ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Providers can update own exit tickets" ON exit_tickets;
CREATE POLICY "Providers can update own exit tickets" ON exit_tickets
  FOR UPDATE USING ((SELECT auth.uid()) = provider_id);

DROP POLICY IF EXISTS "Providers can view own exit tickets" ON exit_tickets;
CREATE POLICY "Providers can view own exit tickets" ON exit_tickets
  FOR SELECT USING ((SELECT auth.uid()) = provider_id);

-- ==========================
-- HOLIDAYS
-- ==========================

DROP POLICY IF EXISTS "Eligible roles can create holidays" ON holidays;
CREATE POLICY "Eligible roles can create holidays" ON holidays
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = created_by
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['resource', 'sea', 'admin'])
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
          OR (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL)
          OR (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  );

DROP POLICY IF EXISTS "Eligible roles can delete holidays" ON holidays;
DROP POLICY IF EXISTS "Non-SEA users can manage holidays" ON holidays;
-- Consolidate delete policies
CREATE POLICY "Users can delete holidays" ON holidays
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND (
          -- Resource specialists, admins can delete future holidays
          (
            profiles.role = ANY(ARRAY['resource', 'admin'])
            AND (
              (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
              OR (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL)
              OR (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
            )
            AND (holidays.date >= CURRENT_DATE OR profiles.role = 'admin')
          )
          -- Or SEAs can delete future holidays
          OR (
            profiles.role = 'sea'
            AND (
              (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
              OR (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL)
              OR (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
            )
            AND (holidays.date >= CURRENT_DATE OR profiles.role = 'admin')
          )
        )
    )
  );

DROP POLICY IF EXISTS "Eligible roles can update holidays" ON holidays;
CREATE POLICY "Users can update holidays" ON holidays
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['resource', 'sea', 'admin'])
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
          OR (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL)
          OR (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  )
  WITH CHECK (
    updated_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = ANY(ARRAY['resource', 'sea', 'admin'])
        AND (
          (profiles.school_site = holidays.school_site AND profiles.school_district = holidays.school_district)
          OR (profiles.school_id::text = holidays.school_id AND holidays.school_id IS NOT NULL)
          OR (profiles.district_id::text = holidays.district_id AND holidays.district_id IS NOT NULL)
        )
    )
  );

-- ==========================
-- LESSONS
-- ==========================

DROP POLICY IF EXISTS "lessons_provider_access" ON lessons;
DROP POLICY IF EXISTS "lessons_sea_access" ON lessons;
-- Consolidate into single policy
CREATE POLICY "lessons_user_access" ON lessons
  FOR ALL USING (
    (SELECT auth.uid()) = provider_id
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.supervising_provider_id = lessons.provider_id
    )
  )
  WITH CHECK ((SELECT auth.uid()) = provider_id);

-- ==========================
-- PROFILES
-- ==========================

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
DROP POLICY IF EXISTS "profiles_service_role_all" ON profiles;
-- Consolidate insert policies
CREATE POLICY "profiles_insert" ON profiles
  FOR INSERT WITH CHECK (
    (SELECT auth.uid()) = id
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "profiles_view_own" ON profiles;
DROP POLICY IF EXISTS "profiles_view_same_schools" ON profiles;
-- Keep service_role_all for SELECT due to different logic
-- Consolidate user view policies
CREATE POLICY "profiles_select_users" ON profiles
  FOR SELECT USING (
    (SELECT auth.uid()) = id
    OR (
      (SELECT auth.uid()) <> id
      AND school_id::text IN (
        SELECT school_id FROM user_accessible_school_ids()
      )
    )
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update" ON profiles
  FOR UPDATE USING (
    (SELECT auth.uid()) = id
    OR (SELECT auth.role()) = 'service_role'
  )
  WITH CHECK (
    (SELECT auth.uid()) = id
    OR (SELECT auth.role()) = 'service_role'
  );

-- ==========================
-- SCHEDULE SESSIONS
-- ==========================

DROP POLICY IF EXISTS "Resource Specialists can assign sessions to authorized SEAs" ON schedule_sessions;
DROP POLICY IF EXISTS "Resource Specialists can assign sessions to same-school special" ON schedule_sessions;
DROP POLICY IF EXISTS "Users and SEAs can update sessions" ON schedule_sessions;
-- Consolidate update policies
CREATE POLICY "Users can update schedule sessions" ON schedule_sessions
  FOR UPDATE USING (
    provider_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (SELECT auth.uid())
        AND profiles.role = 'sea'
        AND profiles.supervising_provider_id = schedule_sessions.provider_id
    )
  )
  WITH CHECK (
    CASE
      WHEN assigned_to_sea_id IS NOT NULL THEN can_assign_sea_to_session((SELECT auth.uid()), assigned_to_sea_id)
      WHEN assigned_to_specialist_id IS NOT NULL THEN can_assign_specialist_to_session((SELECT auth.uid()), assigned_to_specialist_id)
      ELSE true
    END
  );

-- ==========================
-- SCHEDULE SHARE REQUESTS
-- ==========================

DROP POLICY IF EXISTS "Users can create share requests for their schools" ON schedule_share_requests;
CREATE POLICY "Users can create share requests for their schools" ON schedule_share_requests
  FOR INSERT WITH CHECK (
    sharer_id = (SELECT auth.uid())
    AND school_id::text IN (
      SELECT school_id FROM profiles WHERE id = (SELECT auth.uid())
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their own share requests" ON schedule_share_requests;
CREATE POLICY "Users can delete their own share requests" ON schedule_share_requests
  FOR DELETE USING (sharer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view share requests for their schools" ON schedule_share_requests;
CREATE POLICY "Users can view share requests for their schools" ON schedule_share_requests
  FOR SELECT USING (
    school_id::text IN (
      SELECT school_id FROM profiles WHERE id = (SELECT auth.uid())
      UNION
      SELECT school_id FROM provider_schools WHERE provider_id = (SELECT auth.uid())
    )
  );

-- ==========================
-- STUDENT ASSESSMENTS
-- ==========================

DROP POLICY IF EXISTS "Users can insert assessments for their students" ON student_assessments;
CREATE POLICY "Users can insert assessments for their students" ON student_assessments
  FOR INSERT WITH CHECK (
    student_id IN (
      SELECT id FROM students WHERE provider_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can delete their students' assessments" ON student_assessments;
CREATE POLICY "Users can delete their students' assessments" ON student_assessments
  FOR DELETE USING (
    student_id IN (
      SELECT id FROM students WHERE provider_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their students' assessments" ON student_assessments;
CREATE POLICY "Users can update their students' assessments" ON student_assessments
  FOR UPDATE USING (
    student_id IN (
      SELECT id FROM students WHERE provider_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    student_id IN (
      SELECT id FROM students WHERE provider_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view their students' assessments" ON student_assessments;
CREATE POLICY "Users can view their students' assessments" ON student_assessments
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students WHERE provider_id = (SELECT auth.uid())
    )
  );

-- ==========================
-- TEACHERS
-- ==========================

DROP POLICY IF EXISTS "Users can insert teachers for their provider" ON teachers;
CREATE POLICY "Users can insert teachers for their provider" ON teachers
  FOR INSERT WITH CHECK (provider_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can delete teachers for their provider" ON teachers;
CREATE POLICY "Users can delete teachers for their provider" ON teachers
  FOR DELETE USING (provider_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can update teachers for their provider" ON teachers;
CREATE POLICY "Users can update teachers for their provider" ON teachers
  FOR UPDATE USING (provider_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Users can view teachers for their provider" ON teachers;
CREATE POLICY "Users can view teachers for their provider" ON teachers
  FOR SELECT USING (provider_id = (SELECT auth.uid()));
