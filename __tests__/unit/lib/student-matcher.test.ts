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

    // Initials match but grade and name do not -> not a high-confidence dupe.
    expect(result.matches[0].confidence).not.toBe('high');
  });
});

/**
 * SPE-266: identity is full name + grade — initials alone never establish a
 * match. Initials were a privacy-era proxy for identity; a lone initials
 * collision could match (and on confirm overwrite) a *different* student who
 * merely shares initials. These pin the new behavior.
 */
describe('matchStudents — name-based identity (SPE-266)', () => {
  it('does NOT match two different students that share initials AND grade (different names)', () => {
    // The old scorer gave initials (+50) + grade (+40) = 90 = "high" here, which
    // would merge two different children. Now names must agree.
    const result = matchStudents(
      [{ initials: 'ML', gradeLevel: '3', firstName: 'Mary', lastName: 'Lee', goals: [] }] as any,
      [{ id: 'db-1', initials: 'ML', grade_level: '3', first_name: 'Mark', last_name: 'Lopez' }],
    );

    expect(result.matches[0].matchedStudent).toBeNull();
    expect(result.matches[0].confidence).toBe('none');
    expect(result.summary.noMatch).toBe(1);
  });

  it('does NOT match when the DB student has no stored name (the reported incident)', () => {
    // A Mt Diablo import student vs a different-school student stored with only
    // initials (blank name) and a different grade — must be a new insert, never
    // an update that would overwrite the other student's record.
    const result = matchStudents(
      [{ initials: 'ML', gradeLevel: 'TK', firstName: 'Mateo', lastName: 'Landavazo', goals: [] }] as any,
      [{ id: 'db-bancroft', initials: 'ML', grade_level: '1', first_name: '', last_name: '' }],
    );

    expect(result.matches[0].matchedStudent).toBeNull();
    expect(result.matches[0].confidence).toBe('none');
  });

  it('matches when full name + grade agree (a real re-import updates the existing row)', () => {
    const result = matchStudents(
      [{ initials: 'ML', gradeLevel: '3', firstName: 'Marlow', lastName: 'Ljungkull', goals: [] }] as any,
      [{ id: 'db-marlow', initials: 'ML', grade_level: '3', first_name: 'Marlow', last_name: 'Ljungkull' }],
    );

    expect(result.matches[0].matchedStudent?.id).toBe('db-marlow');
    expect(result.matches[0].confidence).toBe('high');
  });

  it('does NOT match an incoming record with a blank name component (avoids empty-fuzzy false match)', () => {
    // compareNames' fuzzy path treats '' as a prefix of anything, so without the
    // incoming-name guard "John" (blank last name) would false-match "John Smith".
    const result = matchStudents(
      [{ initials: 'J', gradeLevel: '3', firstName: 'John', lastName: '', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '3', first_name: 'John', last_name: 'Smith' }],
    );

    expect(result.matches[0].matchedStudent).toBeNull();
    expect(result.matches[0].confidence).toBe('none');
  });

  it('never name-matches a whitespace-only stored name via the empty-fuzzy path', () => {
    // A whitespace-only stored name normalizes to '' — it must never satisfy the
    // NAME match (which would false-match via compareNames' empty-prefix path).
    // It is instead treated as a no-name record and only reached by the explicit
    // initials-enrichment fallback below (SPE-284), never scored as a name match.
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: '3', firstName: 'John', lastName: 'Smith', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '3', first_name: '   ', last_name: ' ' }],
    );

    // Matched (for enrichment, see SPE-284 block) but NOT as a name match:
    // a name match would be 'high'/'medium'; the enrichment fallback is 'low'.
    expect(result.matches[0].confidence).not.toBe('high');
    expect(result.matches[0].confidence).not.toBe('medium');
  });
});

/**
 * SPE-284: full name is becoming the identity anchor, but existing rows may still
 * be initials-only during the transition. A NAMED upload must ENRICH the existing
 * initials-only record (add the name) instead of erroring "already exists" or
 * creating a duplicate. The fallback is deliberately narrow so SPE-266's core
 * guarantee — a stored *real* name is never overwritten via an initials collision
 * — still holds.
 */
describe('matchStudents — initials enrichment fallback (SPE-284)', () => {
  it('enriches a no-name existing record by initials + grade (low confidence)', () => {
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: '3', firstName: 'John', lastName: 'Smith', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '3', first_name: '', last_name: '' }],
    );

    expect(result.matches[0].matchedStudent?.id).toBe('db-1');
    expect(result.matches[0].confidence).toBe('low');
    expect(result.summary.noMatch).toBe(0);
  });

  it('does NOT enrich when the grade differs (guards the reported incident)', () => {
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: 'TK', firstName: 'John', lastName: 'Smith', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '3', first_name: '', last_name: '' }],
    );

    expect(result.matches[0].matchedStudent).toBeNull();
    expect(result.matches[0].confidence).toBe('none');
  });

  it('does NOT initials-match a candidate that HAS a real (differing) name (SPE-266 preserved)', () => {
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: '3', firstName: 'John', lastName: 'Smith', goals: [] }] as any,
      [{ id: 'db-1', initials: 'JS', grade_level: '3', first_name: 'Jane', last_name: 'Sparrow' }],
    );

    expect(result.matches[0].matchedStudent).toBeNull();
    expect(result.matches[0].confidence).toBe('none');
  });

  it('bails on ambiguity — two no-name candidates share initials + grade (no guess)', () => {
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: '3', firstName: 'John', lastName: 'Smith', goals: [] }] as any,
      [
        { id: 'db-1', initials: 'JS', grade_level: '3', first_name: '', last_name: '' },
        { id: 'db-2', initials: 'JS', grade_level: '3', first_name: '', last_name: '' },
      ],
    );

    expect(result.matches[0].matchedStudent).toBeNull();
    expect(result.matches[0].confidence).toBe('none');
  });

  it('prefers a full-name match over the initials fallback when both are possible', () => {
    const result = matchStudents(
      [{ initials: 'JS', gradeLevel: '3', firstName: 'John', lastName: 'Smith', goals: [] }] as any,
      [
        { id: 'db-noname', initials: 'JS', grade_level: '3', first_name: '', last_name: '' },
        { id: 'db-named', initials: 'JS', grade_level: '3', first_name: 'John', last_name: 'Smith' },
      ],
    );

    expect(result.matches[0].matchedStudent?.id).toBe('db-named');
    expect(result.matches[0].confidence).toBe('high');
  });
});
