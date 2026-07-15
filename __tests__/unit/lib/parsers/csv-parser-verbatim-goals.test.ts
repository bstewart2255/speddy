/**
 * SPE-238 regression guard: imported IEP goals are stored VERBATIM.
 *
 * The old at-rest PII scrubber (removed in SPE-238) rewrote common-word first
 * names like "Will" to "[STUDENT]" and target dates like "by 3/15/2027" to
 * "by [DATE]" at the moment of storage — destroying genuinely useful IEP
 * information. This test pins the parse layer to unmangled goal text so a
 * scrubber can't quietly return. The full end-to-end byte-identical guarantee
 * (parser -> preview payload -> stored record) is exercised by the sim run.
 *
 * Fixture data is fictional but mirrors the real SEIS export shape (see
 * csv-parser-bom.test.ts for the fixed column map).
 */

import { parseCSVReport } from '@/lib/parsers/csv-parser';

const HEADERS = [
  'SEIS ID',
  'District ID',
  'Last Name',
  'First Name',
  'Birthdate',
  'Grade',
  'School of Attendance',
  'District of Service',
  'Case Manager',
  'IEP Date',
  'Eligibility Status',
  'Area Of Need',
  'Annual Goal #',
  'Baseline',
  'Goal',
  'Purpose(s) of Goal',
  'Standard',
  'Person Responsible',
];

function row(values: Record<number, string>): string {
  const cells = HEADERS.map((_, i) => values[i] ?? '');
  return cells.map(c => `"${c.replace(/"/g, '""')}"`).join(',');
}

// First name "Will" is the classic scrubber false-positive; the goal text also
// carries a target date the scrubber used to rewrite to "[DATE]".
const GOAL_WITH_NAME_AND_DATE =
  'By 3/15/2027, Will will independently read a grade-level passage at 90 words per minute with 95% accuracy in 3 of 4 trials.';

const CSV_BODY = [
  HEADERS.map(h => `"${h}"`).join(','),
  row({
    0: '2468013',
    2: 'Sanchez',
    3: 'Will',
    5: '04',
    6: 'Example Elementary School',
    9: '03/15/2026',
    11: 'Reading',
    12: 'Academic #1: 2026 - 2027',
    14: GOAL_WITH_NAME_AND_DATE,
    17: 'Resource Specialist',
  }),
].join('\r\n');

describe('parseCSVReport — verbatim IEP goals (SPE-238)', () => {
  it('preserves a student first name and target date inside goal text', async () => {
    const result = await parseCSVReport(Buffer.from(CSV_BODY, 'utf-8'), {
      providerRole: 'resource',
    });

    expect(result.errors).toHaveLength(0);
    expect(result.students).toHaveLength(1);

    const [student] = result.students;
    expect(student.initials).toBe('WS');
    expect(student.goals).toHaveLength(1);

    const goal = student.goals[0];
    // Byte-identical to the source cell: name "Will" and the date both survive.
    expect(goal).toBe(GOAL_WITH_NAME_AND_DATE);
    expect(goal).toContain('Will');
    expect(goal).toContain('3/15/2027');
    expect(goal).not.toContain('[STUDENT]');
    expect(goal).not.toContain('[DATE]');
  });
});
