/**
 * SPE-575 (Codex review, PR #917): the same goal text repeated under two
 * routing signatures must keep BOTH signatures — flat display goals dedupe by
 * text, but claim-time role routing reads goalDetails, and dropping the second
 * signature would hide the goal from that discipline's offers.
 */
import { parseCSVReport } from '@/lib/parsers/csv-parser';

const HEADERS = [
  'SEIS ID', 'District ID', 'Last Name', 'First Name', 'Birthdate', 'Grade',
  'School of Attendance', 'District of Service', 'Case Manager', 'IEP Date',
  'Eligibility Status', 'Area Of Need', 'Annual Goal #', 'Baseline', 'Goal',
  'Purpose(s) of Goal', 'Standard', 'Person Responsible',
];

const row = (area: string, person: string) =>
  [
    '9990001', 'D-1', 'Example', 'Pat', '05/04/2018', '3', 'Fictional Elementary',
    'Fictional USD', 'Casey Manager', '01/15/2026', 'Yes', area, `${area} #1`, 'Baseline',
    'Will follow two-step directions in 4 of 5 opportunities.', '', '', person,
  ]
    .map((v) => `"${v}"`)
    .join(',');

it('keeps every distinct routing signature for repeated goal text', async () => {
  const csv = [
    HEADERS.map((h) => `"${h}"`).join(','),
    row('Speech/Language', 'SLP'),
    row('Academic', 'Resource Specialist'),
    // A literal duplicate row adds nothing.
    row('Speech/Language', 'SLP'),
  ].join('\r\n');

  const result = await parseCSVReport(Buffer.from('﻿' + csv, 'utf-8'));
  expect(result.metadata.formatDetected).toBe('seis-student-goals');
  expect(result.students).toHaveLength(1);

  const student = result.students[0];
  // One display goal…
  expect(student.goals).toHaveLength(1);
  // …but both routing signatures survive.
  expect(student.goalDetails).toHaveLength(2);
  expect(student.goalDetails!.map((d) => d.areaOfNeed).sort()).toEqual([
    'Academic',
    'Speech/Language',
  ]);
});
