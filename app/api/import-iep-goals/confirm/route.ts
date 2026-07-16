/**
 * Per-student IEP goals confirm (SPE-234, atomic in SPE-259).
 *
 * The server-side write for the target-student import flow — the last import
 * write moved off the browser. Two import write semantics live in this codebase,
 * documented here deliberately (ARCH-6):
 *   - Bulk sync (`upsert_students_atomic`, /api/import-students/confirm) = REPLACE
 *     a matched student's goals (with removal warnings shown in review).
 *   - Per-student IEP import (this route) = MERGE: append the selected goals that
 *     aren't already present (case-insensitive, trimmed), never removing any.
 *
 * The read-merge-write runs inside a single transactional RPC (`merge_iep_goals`,
 * SPE-259) so two concurrent confirmations for the same student can't overwrite
 * each other and drop a goal. Ownership is enforced inside the function by
 * scoping to the caller's students (`provider_id = userId`); RLS on
 * `student_details` (via the user-scoped client) is the backstop.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';
import { log } from '@/lib/monitoring/logger';

export const runtime = 'nodejs';

interface GoalMergeInput {
  studentId: string;
  goals: string[];
  /** Sets goals_iep_date when present (the report's IEP date). */
  iepDate?: string;
}

interface MergeResult {
  success: boolean;
  error?: string;
}

/** One row of the merge_iep_goals RPC result set (ord = input index). */
interface MergeRpcRow {
  ord: number;
  success: boolean;
  error_message: string | null;
}

export const POST = withRoute({}, async ({ req: request, userId }) => {
  const supabase = await createClient();
  const body = await request.json();
  const { students } = body as { students: GoalMergeInput[] };

  if (!students || !Array.isArray(students) || students.length === 0) {
    return NextResponse.json({ error: 'No students provided' }, { status: 400 });
  }

  // Normalize the entries the RPC merges: keep only well-formed goal strings and
  // a non-empty IEP date. The DB function enforces ownership (student belongs to
  // the caller) and drops non-UUID / not-owned studentIds to a per-row failure.
  const entries = students.map(s => ({
    studentId: typeof s?.studentId === 'string' ? s.studentId : null,
    goals: Array.isArray(s?.goals) ? s.goals.filter((g): g is string => typeof g === 'string') : [],
    iepDate: typeof s?.iepDate === 'string' && s.iepDate ? s.iepDate : null,
  }));

  // Single atomic merge: the RPC does the read-merge-write per student under a
  // row lock, so concurrent confirmations can't lose a goal.
  const { data, error } = await supabase.rpc('merge_iep_goals', {
    p_provider_id: userId,
    p_entries: entries,
  });

  if (error) {
    log.error('IEP goals confirm: merge_iep_goals RPC failed', error, { userId });
    return NextResponse.json({ error: 'Failed to save goals' }, { status: 500 });
  }

  // The RPC returns one row per input entry, keyed by `ord` (input index). Map
  // back to the route's input-ordered per-row result shape; a missing row
  // defaults to a failure so the caller never silently treats it as saved.
  const rows = (data ?? []) as MergeRpcRow[];
  const byOrd = new Map<number, MergeRpcRow>();
  for (const row of rows) byOrd.set(row.ord, row);

  const results: MergeResult[] = entries.map((_, i) => {
    const row = byOrd.get(i);
    if (row?.success) return { success: true };
    return { success: false, error: row?.error_message || 'Failed to save goals' };
  });
  const succeeded = results.filter(r => r.success).length;

  log.info('IEP goals confirm complete', { userId, total: students.length, succeeded });
  return NextResponse.json({ data: { results } });
});
