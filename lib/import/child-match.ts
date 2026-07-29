/**
 * "Same child?" offers for the bulk import preview (SPE-348).
 *
 * SPE-347 gave every caseload row a `children` row but never attaches to an
 * existing one, so two providers who serve the same pupil still end up with two
 * children. This asks the database, for the NEW rows in a preview, whether any
 * of them look like a child a colleague at this school already serves — and
 * hands the answer to the review screen as an offer the importer confirms or
 * declines. Nothing here decides anything.
 *
 * Deliberately narrow:
 *   - INSERT rows only. An update row already has a caseload row with its own
 *     child; re-pointing it would be a MERGE, which the plan does not do.
 *   - Fail-soft. If the lookup fails the import proceeds exactly as it does
 *     today (a fresh child per row). A create-or-attach offer is an improvement
 *     on the status quo, never a precondition for importing.
 *
 * The matching itself lives in one place — the `import_child_candidates` SQL
 * ladder that the write-time re-validation in `upsert_students_atomic` also
 * calls — so the offer on screen and the guard on the write cannot drift.
 */
import { log } from '@/lib/monitoring/logger';
import type { ChildMatchConflict, ChildMatchOffer } from '@/lib/types/student-import';
import type { ImportSupabaseClient, StudentPreview } from '@/lib/import/preview-types';

/** One entry of the `find_shared_child_candidates` payload. */
type CandidateRow = {
  idx: number;
  childId?: string;
  reason?: string;
  gradeLevel?: string | null;
  districtStudentId?: string | null;
  providerName?: string | null;
  providerRole?: string | null;
  conflict?: string;
  count?: number;
};

const MATCH_REASONS = new Set(['district-student-id', 'name-grade', 'initials-grade-teacher']);
const CONFLICT_KINDS = new Set(['ambiguous', 'id-name-disagreement']);

/**
 * Attach "same child?" offers to the insert rows of a preview, in place.
 *
 * `schoolId` is the school being imported into; without one there is no
 * candidate set (the ladder is school-scoped) and nothing is offered.
 */
export async function attachChildMatches(params: {
  supabase: ImportSupabaseClient;
  userId: string;
  schoolId: string | null;
  previews: StudentPreview[];
}): Promise<void> {
  const { supabase, userId, schoolId, previews } = params;
  if (!schoolId) return;

  // Position in `previews` for each row we ask about, so the RPC's idx-keyed
  // answers land back on the right row.
  const askIndexes: number[] = [];
  const rows = previews.flatMap((preview, index) => {
    if (preview.action !== 'insert') return [];
    const idx = askIndexes.length;
    askIndexes.push(index);
    return [
      {
        idx,
        firstName: preview.firstName || null,
        lastName: preview.lastName || null,
        initials: preview.initials || null,
        gradeLevel: preview.gradeLevel || null,
        // A disputed id (SPE-339) is withheld from the write, so it must not be
        // used to claim a child either — `districtStudentId` is already absent
        // in that case, which is exactly the behaviour we want here.
        districtStudentId: preview.districtStudentId || null,
        teacherId: preview.teacher?.teacherId || null,
        teacherName: preview.teacher?.teacherName || null,
      },
    ];
  });

  if (rows.length === 0) return;

  // Degrade to today's behaviour on ANY failure — a returned error or a thrown
  // one. The offer is an improvement on the status quo, never a precondition for
  // importing, so it must not be able to fail the preview.
  let data: unknown = null;
  try {
    const result = await supabase.rpc('find_shared_child_candidates', {
      p_school_id: schoolId,
      p_rows: rows,
    });
    if (result.error) throw result.error;
    data = result.data;
  } catch (error) {
    log.error(
      'Failed to look up shared-child candidates for import preview',
      error instanceof Error ? error : null,
      { userId, schoolId, rowCount: rows.length },
    );
    return;
  }

  if (!Array.isArray(data)) return;

  for (const candidate of data as CandidateRow[]) {
    const target = previews[askIndexes[candidate.idx]];
    if (!target) continue;

    if (candidate.conflict) {
      if (!CONFLICT_KINDS.has(candidate.conflict)) continue;
      target.childMatchConflict = {
        kind: candidate.conflict as ChildMatchConflict['kind'],
        count: candidate.count,
      };
      continue;
    }

    // Guard the offer shape rather than trusting it: an unknown reason would
    // render as an unlabelled "same child?" prompt with no stated evidence.
    if (!candidate.childId || !candidate.reason || !MATCH_REASONS.has(candidate.reason)) continue;

    target.childMatch = {
      childId: candidate.childId,
      reason: candidate.reason as ChildMatchOffer['reason'],
      gradeLevel: candidate.gradeLevel ?? null,
      districtStudentId: candidate.districtStudentId ?? null,
      providerName: candidate.providerName ?? null,
      providerRole: candidate.providerRole ?? null,
    };
  }
}
