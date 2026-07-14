/**
 * Pure result-mapping for the batched student-import confirm path (SPE-229).
 *
 * The confirm route used to call a write RPC once per student. SPE-229 batches
 * every insert/update into a single `upsert_students_atomic(p_students[])` call.
 * That RPC returns a per-element `results` array in INPUT ORDER, so
 * `rpcResults[i]` corresponds to the i-th student we queued. This module turns
 * those elements back into the per-student `ImportResult` objects the route
 * already returns — preserving the previous behavior exactly, including the
 * friendly duplicate-key message.
 */

export interface ImportResult {
  success: boolean;
  studentId?: string;
  initials: string;
  action: 'inserted' | 'updated' | 'skipped' | 'error';
  error?: string;
}

/** One student queued into the batched upsert (insert or update; skips never reach here). */
export interface PendingUpsert {
  initials: string; // normalized initials, for result messages
  gradeLevel: string; // for the "already exists" message
  action: 'insert' | 'update';
  studentId?: string; // the existing row id, for updates
}

/** A single element of `upsert_students_atomic`'s returned `results` array. */
export interface UpsertRpcResult {
  action?: string;
  studentId?: string;
  initials?: string;
  success?: boolean;
  error?: string;
}

export interface MappedUpsert {
  result: ImportResult;
  /** Which counter to bump; `'updated'` also drives the post-batch session sync. */
  outcome: 'inserted' | 'updated' | 'error';
}

// Substrings the unique-index violation surfaces as; matches the previous
// per-student insert error handling so the user still gets a friendly message.
const DUPLICATE_MARKERS = ['duplicate key', 'unique constraint', 'ux_students_provider_grade_initials'];

function isDuplicateError(message: string): boolean {
  return DUPLICATE_MARKERS.some((marker) => message.includes(marker));
}

/**
 * Map the RPC's per-element results (input-order aligned with `pending`) back to
 * per-student outcomes. A missing or unsuccessful element becomes an error
 * result; a duplicate-key error is rewritten to the friendly "already exists"
 * message. Inserts take their new id from the RPC result; updates keep the id
 * we already had.
 */
export function mapUpsertResults(
  pending: PendingUpsert[],
  rpcResults: UpsertRpcResult[],
): MappedUpsert[] {
  return pending.map((p, i) => {
    const r = rpcResults[i];

    if (!r || !r.success) {
      const errorMessage = r?.error || 'Unknown error';
      const error = isDuplicateError(errorMessage)
        ? `Student with initials "${p.initials}" in grade ${p.gradeLevel} already exists`
        : errorMessage;
      return {
        result: {
          success: false,
          studentId: p.action === 'update' ? p.studentId : undefined,
          initials: p.initials,
          action: 'error',
          error,
        },
        outcome: 'error',
      };
    }

    if (p.action === 'update') {
      return {
        result: { success: true, studentId: p.studentId, initials: p.initials, action: 'updated' },
        outcome: 'updated',
      };
    }

    return {
      result: { success: true, studentId: r.studentId, initials: p.initials, action: 'inserted' },
      outcome: 'inserted',
    };
  });
}
