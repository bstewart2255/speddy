-- SEAs need lesson visibility only, not write access.
-- The lessons_user_access policy created in 20260528_remove_sea_supervising_provider.sql
-- used FOR ALL, so its USING clause also applied to DELETE: a SEA with one
-- assigned session could delete that provider's lessons. Split access into a
-- read-only policy (provider, or SEA with an assigned session) and a
-- provider-only write policy.
DROP POLICY IF EXISTS lessons_user_access ON public.lessons;
DROP POLICY IF EXISTS lessons_provider_write_access ON public.lessons;

CREATE POLICY lessons_user_access ON public.lessons
  FOR SELECT
  USING (
    (SELECT auth.uid()) = provider_id
    OR EXISTS (
      SELECT 1 FROM public.schedule_sessions ss
      WHERE ss.assigned_to_sea_id = (SELECT auth.uid())
        AND ss.provider_id = lessons.provider_id
    )
  );

CREATE POLICY lessons_provider_write_access ON public.lessons
  FOR ALL
  USING ((SELECT auth.uid()) = provider_id)
  WITH CHECK ((SELECT auth.uid()) = provider_id);
