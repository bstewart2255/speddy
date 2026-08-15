-- SPE-497 stage 2: data-layer teardown of the removed Tools suite.
-- Stage 1 (PR #875) deleted all application code; nothing reads or writes any
-- object dropped here. Verified against prod on 2026-08-15: FK graph, views,
-- functions, triggers, and storage policies referencing these objects are all
-- enumerated below — no live object depends on any of them.
--
-- Deliberately KEPT: `lessons` (live session/group notes; only its dead
-- ai_generated rows are deleted), `manual_goal_progress`, `student_assessments`,
-- `assessment_types` (live assessments domain).

-- 1. Pilot data on the one kept table: 321 ai_generated rows (4 pilot
--    accounts, last write 2026-02-03). The 42 lesson_source='manual' rows are
--    live group/session notes and MUST survive.
DELETE FROM public.lessons WHERE lesson_source = 'ai_generated';

-- 2. Reporting view over the upload analytics tables (nothing queries it).
DROP VIEW IF EXISTS public.upload_analytics_summary;

-- 3. Children first (FKs: exit_ticket_results→exit_tickets,
--    progress_check_results→progress_checks, worksheet_submissions→worksheets,
--    lesson_adjustment_queue→worksheet_submissions). Dropping
--    worksheet_submissions also removes its two triggers
--    (check_progress_after_submission, update_metrics_on_submission).
DROP TABLE IF EXISTS public.exit_ticket_results;
DROP TABLE IF EXISTS public.progress_check_results;
DROP TABLE IF EXISTS public.lesson_adjustment_queue;
DROP TABLE IF EXISTS public.worksheet_submissions;

-- 4. Parents and standalone suite tables. All verified 0 rows in prod except
--    exit_tickets (15), progress_checks (3), saved_worksheets (1) — pilot
--    data approved for deletion with the feature.
DROP TABLE IF EXISTS public.exit_tickets;
DROP TABLE IF EXISTS public.progress_checks;
DROP TABLE IF EXISTS public.worksheets;
DROP TABLE IF EXISTS public.saved_worksheets;
DROP TABLE IF EXISTS public.upload_rate_limits;
DROP TABLE IF EXISTS public.analytics_events;
DROP TABLE IF EXISTS public.lesson_performance_history;
DROP TABLE IF EXISTS public.student_performance_metrics;
DROP TABLE IF EXISTS public.iep_goal_progress;
DROP TABLE IF EXISTS public.progress_notifications;

-- 5. Orphaned trigger functions of the dropped worksheet_submissions triggers.
DROP FUNCTION IF EXISTS public.check_progress_milestones();
DROP FUNCTION IF EXISTS public.update_performance_metrics();

-- 6. Storage policies scoped to the three suite buckets (verified: each
--    policy's qual/with_check names exactly one of these buckets — nothing
--    here touches documents / group-documents / session-documents).
--    The buckets themselves CANNOT be removed in SQL — Supabase's
--    storage.protect_delete() trigger rejects direct deletes (caught on the
--    branch-DB rehearsal, 2026-08-15). Emptying + deleting the buckets is
--    done through the Storage API by scripts/spe497-remove-tools-buckets.ts,
--    run immediately after this migration as step 2 of the apply runbook.
DROP POLICY IF EXISTS "Anyone can upload worksheet images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view worksheet images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own uploads" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own worksheets" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own worksheets" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own worksheets" ON storage.objects;
