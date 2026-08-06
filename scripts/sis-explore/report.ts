/**
 * SPE-398 · rendering the findings, and keeping student IDs out of the terminal.
 *
 * THE PII RULE, made structural rather than remembered. SPE-398 says reports
 * carry student-level district IDs, so they go to a git-ignored file and never
 * into Linear or chat beyond aggregates. The obvious way to break that is not
 * malice — it is copying a terminal transcript into a ticket.
 *
 * So there are two renderers and they are not the same text:
 *
 *   renderSummary() — aggregates only. Safe to paste anywhere. This is what
 *     the CLI prints.
 *   renderFull()    — the same findings plus the student-level lists. Written
 *     to disk under a git-ignored path and never printed.
 *
 * A test asserts that no district ID appearing in the detail can appear in the
 * summary. That makes the rule checkable instead of merely stated.
 */
import type {
  IdSemanticsReport,
  MatchRateReport,
  SpedFlagReport,
  TeacherLinkageReport,
} from './analysis';

export interface Findings {
  districtId: string;
  sisType: 'aeries' | 'oneroster';
  source: string;
  idSemantics: IdSemanticsReport;
  matchRate: MatchRateReport;
  teacherLinkage: TeacherLinkageReport;
  /** Aeries only — OneRoster carries no special-education flag at all. */
  spedFlags?: SpedFlagReport;
}

const pct = (n: number) => `${n}%`;

function distribution(d: Record<number, number>): string {
  const keys = Object.keys(d).map(Number).sort((a, b) => a - b);
  if (keys.length === 0) return '_no data_';
  return keys.map((k) => `${k} teacher${k === 1 ? '' : 's'}: ${d[k]}`).join(' · ');
}

/** Aggregates only. Safe to paste into Linear or a chat. */
export function renderSummary(f: Findings): string {
  const { idSemantics: id, matchRate: m, teacherLinkage: t, spedFlags: sp } = f;
  const lines: string[] = [];

  lines.push(`# SIS exploration — ${f.districtId} (${f.sisType})`);
  lines.push(`Source: ${f.source}`);
  lines.push('');

  lines.push('## 1. Do our student numbers mean their student numbers?');
  lines.push('');
  lines.push(`**${id.verdict}** — ${id.verdictReason}`);
  lines.push('');
  lines.push(`- District IDs entered in Speddy: ${id.speddyIdsEntered}`);
  lines.push(`- SIS records read: ${id.sisRecords} (${id.sisIdsPresent} carried an identifier)`);
  lines.push(`- Found in both: ${id.overlap}`);
  lines.push(
    `- Format — Speddy: ${id.speddyFormat.allDigits}/${id.speddyFormat.count} all-digits, ` +
      `lengths ${JSON.stringify(id.speddyFormat.lengths)}`,
  );
  lines.push(
    `- Format — SIS: ${id.sisFormat.allDigits}/${id.sisFormat.count} all-digits, ` +
      `lengths ${JSON.stringify(id.sisFormat.lengths)}`,
  );
  lines.push('');

  lines.push('## 2. How much of the caseload can the SIS enrich?');
  lines.push('');
  if (id.verdict !== 'same-namespace') {
    lines.push(
      `> ⚠️ The ID check came back **${id.verdict}**, so the figures below are not ` +
        'trustworthy yet. Settle report 1 first.',
    );
    lines.push('');
  }
  lines.push(`- Caseload rows: ${m.speddyStudents} → distinct children: ${m.speddyChildren}`);
  lines.push(`- Have a district ID entered: ${m.withId} · missing one: ${m.withoutId}`);
  lines.push(`- Matched to a SIS record: **${m.matched}**`);
  lines.push(`- ID entered but not found in the SIS: ${m.unmatchedNotInSis}`);
  lines.push(`- **Match rate: ${pct(m.matchRateOfAll)} of the caseload**, ` +
    `${pct(m.matchRateOfThoseWithId)} of those with an ID entered`);
  if (m.duplicates.length) {
    lines.push(`- ⚠️ ${m.duplicates.length} district ID(s) appear on more than one child`);
  }
  if (m.backfillGap) {
    lines.push(
      `- ⚠️ ${m.backfillGap} student(s) have a district ID on the caseload row that never reached ` +
        'the child record. That is our backfill gap, not missing data at the district — ' +
        'those students are unmatchable until it is closed.',
    );
  }
  lines.push('');

  lines.push('## 3. Secondary teacher linkage (SPE-334/342)');
  lines.push('');
  lines.push(`- Matched students at secondary schools: ${t.secondaryMatched}`);
  lines.push(`- Teachers per student: ${distribution(t.teachersPerStudent)}`);
  lines.push(`- **Today's single-teacher model describes ${pct(t.oneTeacherModelCoverage)}** ` +
    'of the students the SIS gave schedule data for');
  lines.push(`- Speddy's teacher confirmed by the SIS: ${t.speddyTeacherConfirmed}`);
  lines.push(`- Speddy's teacher resolved but NOT listed for that student: ${t.speddyTeacherNotInSisSet}`);
  lines.push(`- Speddy's teacher could not be resolved to a SIS teacher: ${t.speddyTeacherUnresolvable}`);
  lines.push(`- No teacher recorded in Speddy: ${t.speddyTeacherAbsent}`);
  lines.push(`- No schedule data from the SIS: ${t.noSisTeachers}`);
  lines.push('');

  if (sp) {
    lines.push('## 4. Special-education flag comparison (Aeries)');
    lines.push('');
    lines.push(`- Flagged in Aeries: ${sp.sisSpedStudents} · on a Speddy caseload: ${sp.speddyCaseloadChildren}`);
    lines.push(`- In both: ${sp.inBoth}`);
    lines.push(`- Flagged in Aeries, not on any Speddy caseload: ${sp.sisOnly}`);
    lines.push(`- On a Speddy caseload, not flagged in Aeries: ${sp.speddyOnly}`);
    lines.push('');
  } else {
    lines.push('## 4. Special-education flag comparison');
    lines.push('');
    lines.push('_Not available over OneRoster — the standard carries no special-education flag._');
    lines.push('');
  }

  lines.push('---');
  lines.push('Student-level detail is in the full report on disk, and is not reproduced here.');
  return lines.join('\n');
}

/** The summary plus student-level lists. Git-ignored path only — never printed. */
export function renderFull(f: Findings): string {
  const { matchRate: m, teacherLinkage: t, spedFlags: sp } = f;
  const section = (title: string, ids: string[]) =>
    ids.length
      ? [`### ${title} (${ids.length})`, '', ...ids.map((i) => `- ${i}`), ''].join('\n')
      : `### ${title}\n\n_none_\n`;

  return [
    renderSummary(f),
    '',
    '---',
    '',
    '# Student-level detail',
    '',
    '> Contains district student IDs. This file is git-ignored. Do not paste it',
    '> into Linear, a chat, or a ticket — the summary above is the shareable part.',
    '',
    section('District IDs entered in Speddy but not found in the SIS', m.unmatchedIds),
    section('Secondary students with more than one SIS teacher', t.multiTeacherIds),
    section(
      'District IDs entered on more than one child',
      m.duplicates.map((d) => `${d.districtStudentId} → children ${d.childIds.join(', ')}`),
    ),
    ...(sp
      ? [
          section('Flagged special education in Aeries, absent from Speddy', sp.sisOnlyIds),
          section('On a Speddy caseload, not flagged in Aeries', sp.speddyOnlyIds),
        ]
      : []),
  ].join('\n');
}

/** Every student-level identifier the full report discloses. Used by the PII test. */
export function detailIds(f: Findings): string[] {
  return [
    ...f.matchRate.unmatchedIds,
    ...f.matchRate.duplicates.map((d) => d.districtStudentId),
    ...f.teacherLinkage.multiTeacherIds,
    ...(f.spedFlags?.sisOnlyIds ?? []),
    ...(f.spedFlags?.speddyOnlyIds ?? []),
  ];
}
