import { adaptBulkPreview } from '@/lib/import/review-model';
import type { BulkPreviewData, StudentToImport } from '@/lib/types/student-import';

/**
 * SPE-236 drift-detection guard.
 *
 * The preview/confirm wire types live in one shared module (`@/lib/types/
 * student-import`) imported by BOTH the route (producer) and the client adapter
 * (consumer). The fixtures below are typed `satisfies BulkPreviewData` /
 * `satisfies StudentToImport`, so intentionally renaming a field in the shared
 * contract breaks THIS test's compilation — the client-side half of the guard.
 * The producer-side half is the `satisfies BulkPreviewData` binding on every
 * response in app/api/import-students/route.ts; both are enforced by `tsc`.
 */
describe('student-import shared contract (SPE-236)', () => {
  it('adapts a shared-typed bulk preview payload into the review model', () => {
    // Typed against the shared contract: a field rename breaks this literal.
    const payload = {
      students: [
        {
          firstName: 'Ada',
          lastName: 'Byron',
          initials: 'AB',
          gradeLevel: '3',
          action: 'insert',
          goals: [{ text: 'Read 90 wpm' }],
        },
        {
          firstName: 'Cal',
          lastName: 'Diaz',
          initials: 'CD',
          gradeLevel: '4',
          action: 'update',
          matchedStudentId: 'stu-1',
          goals: [{ text: 'Add 2-digit' }],
        },
        {
          firstName: 'Eve',
          lastName: 'Frost',
          initials: 'EF',
          gradeLevel: '5',
          action: 'skip',
          matchedStudentId: 'stu-2',
          goals: [{ text: 'Already met' }],
        },
      ],
      summary: { total: 3, inserts: 1, updates: 1, skips: 1 },
    } satisfies BulkPreviewData;

    const model = adaptBulkPreview(payload);

    expect(model.rows).toHaveLength(3);
    expect(model.summary.inserts).toBe(1);
    expect(model.summary.updates).toBe(1);
    expect(model.summary.skips).toBe(1);
    // action drives the row status; the matched id becomes targetStudentId.
    expect(model.rows[0].action).toBe('insert');
    expect(model.rows[1].targetStudentId).toBe('stu-1');
    // Skipped rows are excluded from the goal total.
    expect(model.summary.totalGoals).toBe(2);
  });

  it('accepts a null gradeLevel on the wire (deliveries/class-list update rows)', () => {
    const payload = {
      students: [
        {
          firstName: 'Gil',
          lastName: 'Hart',
          initials: 'GH',
          gradeLevel: null,
          action: 'update',
          studentId: 'stu-3',
        },
      ],
      summary: { total: 1, updates: 1 },
    } satisfies BulkPreviewData;

    const model = adaptBulkPreview(payload);
    // The adapter narrows a null grade to '' for the UI model.
    expect(model.rows[0].gradeLevel).toBe('');
    expect(model.rows[0].targetStudentId).toBe('stu-3');
  });

  it('pins the confirm request row shape', () => {
    const row = {
      firstName: 'Ada',
      lastName: 'Byron',
      initials: 'AB',
      gradeLevel: '3',
      goals: ['Read 90 wpm'],
      action: 'insert',
    } satisfies StudentToImport;

    expect(row.action).toBe('insert');
    expect(row.goals).toEqual(['Read 90 wpm']);
  });
});
