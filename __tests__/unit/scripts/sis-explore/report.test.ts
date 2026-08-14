/**
 * SPE-398 · the PII split, asserted rather than intended.
 *
 * The ticket's rule is that student-level district IDs go to a git-ignored file
 * and never into Linear or chat beyond aggregates. The realistic way that rule
 * breaks is nobody being careless — it is someone copying a terminal transcript
 * into a ticket because the terminal is what they were looking at.
 *
 * So the CLI prints `renderSummary` and only `renderSummary`, and this file
 * pins the property that makes that safe: no identifier disclosed in the full
 * report may appear in the summary. It is written generically over
 * `detailIds()` so a NEW detail list added later is covered automatically
 * rather than needing someone to remember this test exists.
 */
import {
  detailIds,
  renderFull,
  renderSummary,
  type Findings,
} from '../../../../scripts/sis-explore/report';

/** Distinctive IDs — a substring match must not succeed by accident. */
const UNMATCHED = ['777001', '777002'];
const MULTI_TEACHER = ['777003'];
const SIS_ONLY = ['777004'];
const SPEDDY_ONLY = ['777005'];

const findings = (over: Partial<Findings> = {}): Findings => ({
  districtId: 'SIM-D001',
  sisType: 'aeries',
  source: 'stored connection',
  idSemantics: {
    speddyIdsEntered: 10,
    sisRecords: 100,
    sisIdsPresent: 100,
    overlap: 8,
    speddyFormat: { count: 10, allDigits: 10, lengths: { 6: 10 } },
    sisFormat: { count: 100, allDigits: 100, lengths: { 6: 100 } },
    verdict: 'same-namespace',
    verdictReason: '8 of 10 district IDs entered in Speddy were found in the SIS.',
  },
  matchRate: {
    speddyStudents: 12,
    speddyChildren: 10,
    withId: 10,
    withoutId: 0,
    matched: 8,
    unmatchedNotInSis: 2,
    matchRateOfAll: 80,
    matchRateOfThoseWithId: 80,
    duplicates: [],
    backfillGap: 0,
    probableDuplicateChild: 0,
    unmatchedIds: UNMATCHED,
  },
  teacherLinkage: {
    secondaryMatched: 4,
    teachersPerStudent: { 1: 3, 5: 1 },
    speddyTeacherConfirmed: 2,
    speddyTeacherNotInSisSet: 1,
    speddyTeacherUnresolvable: 1,
    speddyTeacherAbsent: 0,
    noSisTeachers: 0,
    oneTeacherModelCoverage: 75,
    multiTeacherIds: MULTI_TEACHER,
  },
  spedFlags: {
    sisSpedStudents: 30,
    speddyCaseloadChildren: 10,
    inBoth: 8,
    sisOnly: 22,
    speddyOnly: 2,
    sisOnlyIds: SIS_ONLY,
    speddyOnlyIds: SPEDDY_ONLY,
  },
  ...over,
});

describe('the summary is safe to paste; the full report is not', () => {
  it('leaks NO student identifier into the summary', () => {
    const f = findings();
    const summary = renderSummary(f);
    const ids = detailIds(f);

    expect(ids.length).toBeGreaterThan(0); // the assertion below must have teeth
    for (const id of ids) {
      expect(summary).not.toContain(id);
    }
  });

  it('does disclose them in the full report — that is what it is for', () => {
    const full = renderFull(findings());
    for (const id of [...UNMATCHED, ...MULTI_TEACHER, ...SIS_ONLY, ...SPEDDY_ONLY]) {
      expect(full).toContain(id);
    }
  });

  it('warns, inside the file, against pasting it anywhere', () => {
    expect(renderFull(findings())).toMatch(/git-ignored[\s\S]*do not paste/i);
  });

  it('still reports the counts in the summary, just not the identities', () => {
    // The aggregates are the point of the summary — a redaction that removed
    // them too would make the safe artifact useless and push people to the
    // unsafe one.
    const summary = renderSummary(findings());
    expect(summary).toContain('Match rate: 80%');
    expect(summary).toMatch(/not found in the SIS: 2/);
  });
});

describe('the summary refuses to be read out of context', () => {
  it('warns that the match rate is untrustworthy when the ID check did not settle', () => {
    // Reporting "match rate: 0%" without this banner would look like a data
    // problem at the district, when the real answer is that we are comparing
    // two different numbers.
    const summary = renderSummary(
      findings({
        idSemantics: { ...findings().idSemantics, verdict: 'no-overlap' },
      }),
    );
    expect(summary).toMatch(/not\s+trustworthy yet/i);
    expect(summary).toMatch(/Settle report 1 first/i);
  });

  it('does not warn when the ID check came back clean', () => {
    expect(renderSummary(findings())).not.toMatch(/not\s+trustworthy yet/i);
  });

  it('tells someone to move a stranded ID across only when nothing else claims it', () => {
    const f = findings();
    const summary = renderSummary({
      ...f,
      matchRate: { ...f.matchRate, backfillGap: 11 },
    });
    expect(summary).toMatch(/11 student\(s\)/);
    expect(summary).toMatch(/no other child record claims that ID/i);
    expect(summary).toMatch(/moving it onto the child record/i);
  });

  it('never suggests copying an ID that already belongs to another child (SPE-409)', () => {
    // The failure this ticket exists to prevent: the report naming a cheap,
    // safe-sounding remedy for a state whose real remedy is a careful merge.
    // Acting on the old wording would have put one district student ID on two
    // children — every real instance at JSUSD was this state.
    const f = findings();
    const summary = renderSummary({
      ...f,
      matchRate: { ...f.matchRate, probableDuplicateChild: 11, backfillGap: 0 },
    });
    expect(summary).toMatch(/11 student\(s\)/);
    expect(summary).toMatch(/already belongs to a different child record/i);
    expect(summary).toMatch(/Do not copy it across/i);
    // and none of the copy-it-across language from the other branch
    expect(summary).not.toMatch(/moving it onto the child record/i);
  });

  it('reports both states side by side when a district has each', () => {
    const f = findings();
    const summary = renderSummary({
      ...f,
      matchRate: { ...f.matchRate, probableDuplicateChild: 9, backfillGap: 2 },
    });
    expect(summary).toMatch(/9 student\(s\)/);
    expect(summary).toMatch(/2 student\(s\)/);
    expect(summary).toMatch(/Do not copy it across/i);
    expect(summary).toMatch(/moving it onto the child record/i);
  });

  it('says plainly that OneRoster cannot answer the special-ed question', () => {
    // The owner-accepted limitation. A blank section would read as "we did not
    // check" rather than "the standard has no such field".
    const summary = renderSummary(findings({ sisType: 'oneroster', spedFlags: undefined }));
    expect(summary).toMatch(/no special-education flag/i);
  });
});
