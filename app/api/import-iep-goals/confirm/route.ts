/**
 * Per-student IEP goals confirm (SPE-234).
 *
 * The server-side write for the target-student import flow — the last import
 * write moved off the browser. Two import write semantics live in this codebase,
 * documented here deliberately (ARCH-6):
 *   - Bulk sync (`upsert_students_atomic`, /api/import-students/confirm) = REPLACE
 *     a matched student's goals (with removal warnings shown in review).
 *   - Per-student IEP import (this route) = MERGE: append the selected goals that
 *     aren't already present (case-insensitive, trimmed), never removing any.
 *
 * Ownership is enforced server-side by scoping to the caller's students
 * (`provider_id = userId`), the same pattern as the import RPCs; RLS on
 * `student_details` (via the user-scoped client) is the backstop.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withRoute } from '@/lib/api/with-route';
import { log } from '@/lib/monitoring/logger';
import { mergeGoals } from '@/lib/import/merge-goals';

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

// Canonical UUID form; mirrors app/api/import-students/confirm/route.ts. A
// studentId that isn't a UUID can't be one of the caller's students, so it's
// dropped here (→ per-row "not found") rather than 500-ing the .in() uuid cast.
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const POST = withRoute({}, async ({ req: request, userId }) => {
  const supabase = await createClient();
  const body = await request.json();
  const { students } = body as { students: GoalMergeInput[] };

  if (!students || !Array.isArray(students) || students.length === 0) {
    return NextResponse.json({ error: 'No students provided' }, { status: 400 });
  }

  // Ownership: only students that belong to the authenticated provider may be
  // written. A studentId not returned here (another provider's, or nonexistent)
  // is reported as a per-row failure rather than written.
  const studentIds = [
    ...new Set(students.map(s => s?.studentId).filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id))),
  ];

  const owned = new Set<string>();
  const existingByStudent = new Map<string, string[]>();

  if (studentIds.length > 0) {
    const { data: ownedRows, error: ownedError } = await supabase
      .from('students')
      .select('id')
      .eq('provider_id', userId)
      .in('id', studentIds);
    if (ownedError) {
      log.error('IEP goals confirm: ownership lookup failed', ownedError, { userId });
      return NextResponse.json({ error: 'Failed to verify students' }, { status: 500 });
    }
    for (const row of ownedRows ?? []) owned.add(row.id);

    // Batch-fetch existing goals for the owned students (one query, not N).
    if (owned.size > 0) {
      const { data: existingDetails, error: detailsError } = await supabase
        .from('student_details')
        .select('student_id, iep_goals')
        .in('student_id', [...owned]);
      if (detailsError) {
        log.error('IEP goals confirm: details fetch failed', detailsError, { userId });
        return NextResponse.json({ error: 'Failed to load existing goals' }, { status: 500 });
      }
      for (const d of existingDetails ?? []) {
        existingByStudent.set(d.student_id, d.iep_goals || []);
      }
    }
  }

  // Input-ordered results, so the caller maps each outcome back by position.
  const results: MergeResult[] = [];
  let succeeded = 0;

  for (const entry of students) {
    const studentId = entry?.studentId;
    if (typeof studentId !== 'string' || !owned.has(studentId)) {
      results.push({ success: false, error: 'Student not found in your caseload' });
      continue;
    }

    // Only well-formed goal strings are merged; a row with none is a no-op skip.
    const goals = Array.isArray(entry.goals)
      ? entry.goals.filter((g): g is string => typeof g === 'string')
      : [];
    if (goals.length === 0) {
      results.push({ success: true });
      succeeded++;
      continue;
    }

    try {
      const existing = existingByStudent.get(studentId) ?? [];
      const merged = mergeGoals(existing, goals);

      const upsertData: {
        student_id: string;
        iep_goals: string[];
        updated_at: string;
        goals_iep_date?: string;
      } = {
        student_id: studentId,
        iep_goals: merged,
        updated_at: new Date().toISOString(),
      };
      if (typeof entry.iepDate === 'string' && entry.iepDate) {
        upsertData.goals_iep_date = entry.iepDate;
      }

      const { error } = await supabase
        .from('student_details')
        .upsert(upsertData, { onConflict: 'student_id' });
      if (error) throw error;

      // Keep the in-memory copy current so a repeated studentId in the same
      // request accumulates (matching the retired client's sequential re-read)
      // instead of the second write clobbering the first.
      existingByStudent.set(studentId, merged);
      results.push({ success: true });
      succeeded++;
    } catch (err) {
      results.push({
        success: false,
        error: (err as { message?: string })?.message ?? 'Failed to save goals',
      });
    }
  }

  log.info('IEP goals confirm complete', { userId, total: students.length, succeeded });
  return NextResponse.json({ data: { results } });
});
