import { matchStudents } from '@/lib/utils/student-matcher';

/**
 * SPE-240: the SEIS/XLSX parser now normalizes grade "18" -> 'TK' and "0" -> 'K'
 * (previously the XLSX copy left them raw). Students imported before that fix
 * are stored with grade_level '18'/'0'. The matcher must reconcile those legacy
 * values with the 'TK'/'K' a re-import now produces, so the student matches
 * their existing row (an update) instead of being demoted to a new insert —
 * which the grade-keyed unique index (provider_id, grade_level, initials) would
 * not catch, silently creating a duplicate row for the same child.
 */
describe('matchStudents — legacy SEIS grade reconciliation (SPE-240)', () => {
  it("matches a re-parsed 'TK' student against a legacy grade_level '18' row (high confidence)", () => {
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: 'TK', firstName: 'Jamie', lastName: 'Stone', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '18', first_name: 'Jamie', last_name: 'Stone' }],
    );

    // Without the fix, the grade mismatch drops 40 pts and the student is no
    // longer a high-confidence match to their existing row.
    expect(result.matches[0].matchedStudent?.id).toBe('db-1');
    expect(result.matches[0].confidence).toBe('high');
    expect(result.summary.noMatch).toBe(0);
  });

  it("matches a re-parsed 'K' student against a legacy grade_level '0' row (high confidence)", () => {
    const result = matchStudents(
      [{ initials: 'AB', gradeLevel: 'K', firstName: 'Ada', lastName: 'Blythe', goals: [] }] as any,
      [{ id: 'db-2', initials: 'AB', grade_level: '0', first_name: 'Ada', last_name: 'Blythe' }],
    );

    expect(result.matches[0].matchedStudent?.id).toBe('db-2');
    expect(result.matches[0].confidence).toBe('high');
  });

  it('still treats a genuinely different grade as a non-duplicate (no false reconciliation)', () => {
    // A real grade-3 student must NOT match a stored TK ('18') row just because
    // the initials line up — the grade normalizer only equates 18<->TK / 0<->K.
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: '3', firstName: 'Jamie', lastName: 'Stone', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '18', first_name: 'Other', last_name: 'Person' }],
    );

    // Initials match (50) but grade and name do not -> not a high-confidence dupe.
    expect(result.matches[0].confidence).not.toBe('high');
  });
});
