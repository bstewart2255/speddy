/**
 * SPE-227: the bulk adapter is the keystone — it normalizes all four preview
 * payload shapes into one ReviewModel so the review UI never learns the wire
 * shapes. These tests pin each shape (goals-only insert, goals+deliveries+class
 * update, deliveries-only "update mode"/Builder B, roster template/Builder C).
 */

import { adaptBulkPreview, type BulkPreviewData } from '@/lib/import/review-model';

describe('adaptBulkPreview (SPE-227)', () => {
  it('normalizes a goals-only insert: goals marked added, stable new:N id, no exceptions', () => {
    const data: BulkPreviewData = {
      students: [
        {
          firstName: 'Jane',
          lastName: 'Doe',
          initials: 'JD',
          gradeLevel: '3',
          action: 'insert',
          goals: [{ text: 'Read 90 wpm' }, { text: 'Solve 2-digit addition' }],
        },
      ],
      summary: { total: 1, inserts: 1, updates: 0, skips: 0 },
      files: [
        {
          fileKey: 'studentsFile',
          fileName: 'goals.csv',
          read: 1,
          matched: 1,
          filtered: 0,
        },
      ],
    };

    const model = adaptBulkPreview(data);

    expect(model.mode).toBe('bulk');
    expect(model.writeMode).toBe('replace');
    expect(model.rows).toHaveLength(1);
    const row = model.rows[0];
    expect(row.id).toBe('new:0');
    expect(row.action).toBe('insert');
    expect(row.displayName).toBe('Jane Doe');
    expect(row.goals.every((g) => g.status === 'added')).toBe(true);
    expect(model.exceptions).toHaveLength(0);
    expect(model.summary).toMatchObject({ totalStudents: 1, inserts: 1, updates: 0, skips: 0, totalGoals: 2 });

    // Receipt label/fills are derived from the file key.
    expect(model.files[0]).toMatchObject({ label: 'Student & goals report', fills: 'students & IEP goals', notes: [] });
  });

  it('normalizes an update with removed goals + low-confidence teacher into exceptions', () => {
    const data: BulkPreviewData = {
      students: [
        {
          firstName: 'Sam',
          lastName: 'Lee',
          initials: 'SL',
          gradeLevel: '4',
          action: 'update',
          matchedStudentId: 'stu-1',
          matchConfidence: 'high',
          goals: [{ text: 'New goal A' }, { text: 'Kept goal B' }],
          changes: { goals: { added: ['New goal A'], removed: ['Old goal C'], unchanged: ['Kept goal B'] } },
          goalsRemoved: ['Old goal C'],
          teacher: { teacherId: null, teacherName: 'R. Gutierrez', confidence: 'low', reason: 'fuzzy match' },
        },
      ],
      summary: { total: 1, inserts: 0, updates: 1, skips: 0 },
      unmatchedStudents: [{ name: 'Unknown Kid', source: 'deliveries' }],
    };

    const model = adaptBulkPreview(data);

    const row = model.rows[0];
    expect(row.id).toBe('stu-1');
    expect(row.targetStudentId).toBe('stu-1');
    expect(row.action).toBe('update');
    expect(row.goals.find((g) => g.text === 'New goal A')?.status).toBe('added');
    expect(row.goals.find((g) => g.text === 'Kept goal B')?.status).toBe('unchanged');
    expect(row.goalsRemoved).toEqual(['Old goal C']);
    expect(row.teacher?.signal).toBe('check');

    // One exception each: unmatched student, low-confidence teacher, goals removed.
    expect(model.exceptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'unmatched-student', name: 'Unknown Kid', source: 'deliveries' }),
        expect.objectContaining({ kind: 'low-confidence-teacher', rowId: 'stu-1', studentLabel: 'Sam Lee' }),
        expect.objectContaining({ kind: 'goals-removed', rowId: 'stu-1', goals: ['Old goal C'] }),
      ])
    );
    expect(model.exceptions).toHaveLength(3);
  });

  it('normalizes deliveries-only update mode (Builder B): studentId, no goals, schedule kept', () => {
    const data: BulkPreviewData = {
      mode: 'update',
      students: [
        {
          firstName: 'Ana',
          lastName: 'Ruiz',
          initials: 'AR',
          gradeLevel: '2',
          action: 'update',
          studentId: 'stu-9', // Builder B uses studentId, not matchedStudentId
          schedule: { sessionsPerWeek: 3, minutesPerSession: 30 },
        },
      ],
      summary: { total: 1, inserts: 0, updates: 1, skips: 0 },
    };

    const model = adaptBulkPreview(data);
    const row = model.rows[0];
    expect(row.targetStudentId).toBe('stu-9');
    expect(row.id).toBe('stu-9');
    expect(row.goals).toEqual([]);
    expect(row.schedule).toEqual({ sessionsPerWeek: 3, minutesPerSession: 30 });
    expect(model.summary.totalGoals).toBe(0);
  });

  it('normalizes a roster row (Builder C): name-less student falls back to initials', () => {
    const data: BulkPreviewData = {
      students: [
        { firstName: '', lastName: '', initials: 'TT', gradeLevel: '3', action: 'insert', goals: [] },
      ],
      summary: { total: 1, inserts: 1, updates: 0, skips: 0 },
    };

    const model = adaptBulkPreview(data);
    expect(model.rows[0].displayName).toBe('TT');
    expect(model.rows[0].goals).toEqual([]);
    expect(model.files).toEqual([]); // no files field on the payload → empty receipts
  });

  it('counts inserts/updates/skips and totals goals over selectable rows only', () => {
    const data: BulkPreviewData = {
      students: [
        { firstName: 'A', lastName: 'A', initials: 'AA', gradeLevel: '1', action: 'insert', goals: [{ text: 'g1' }] },
        { firstName: 'B', lastName: 'B', initials: 'BB', gradeLevel: '1', action: 'update', matchedStudentId: 's2', goals: [{ text: 'g2' }, { text: 'g3' }] },
        { firstName: 'C', lastName: 'C', initials: 'CC', gradeLevel: '1', action: 'skip', matchedStudentId: 's3', goals: [{ text: 'gX' }] },
      ],
      summary: { total: 3, inserts: 1, updates: 1, skips: 1 },
    };

    const model = adaptBulkPreview(data);
    expect(model.summary).toMatchObject({ totalStudents: 3, inserts: 1, updates: 1, skips: 1 });
    // skip row's goal is excluded from the total.
    expect(model.summary.totalGoals).toBe(3);
  });
});
