/**
 * SPE-122 spike — pull SpEd-filtered students from Aeries and map to Speddy.
 *
 * THROWAWAY exploratory code (not wired into the app). Proves the core value
 * path end-to-end against the public Aeries demo instance and prints a concrete
 * field mapping + gap analysis vs. Speddy's `students` table.
 *
 * Run:  npx tsx scripts/aeries-sped-spike.ts
 *
 * Uses the demo instance by default (no secrets). Point at a real district with:
 *   AERIES_BASE_URL=... AERIES_CERTIFICATE=... npx tsx scripts/aeries-sped-spike.ts
 */

import {
  createAeriesClient,
  indexSpedStudents,
  SPED_PROGRAM_CODE,
  type RawAeriesProgram,
  type RawAeriesStudent,
} from '@/lib/integrations/aeries';

/** Derive Speddy's PII-minimized `initials` from an Aeries name. */
function toInitials(first?: string, last?: string): string {
  const f = (first ?? '').trim()[0] ?? '';
  const l = (last ?? '').trim()[0] ?? '';
  return (f + l).toUpperCase() || '??';
}

async function main() {
  const client = createAeriesClient();
  console.log('Aeries SpEd spike — fetching schools…\n');

  const schools = await client.getSchools({ fields: ['SchoolCode', 'Name'] });
  if (!schools.length) {
    console.log('No schools returned. Check connectivity / certificate.');
    return;
  }

  // Walk schools until we find one with SpEd (144) program records.
  for (const school of schools) {
    const schoolCode = school.SchoolCode;
    let programs: RawAeriesProgram[] = [];
    try {
      programs = await client.getStudentPrograms(schoolCode, 0, SPED_PROGRAM_CODE);
    } catch (err) {
      console.log(`  school ${schoolCode} (${school.Name}): programs unavailable (${(err as Error).message})`);
      continue;
    }

    const sped = indexSpedStudents(programs);
    if (sped.size === 0) {
      console.log(`  school ${schoolCode} (${school.Name}): 0 SpEd students`);
      continue;
    }

    console.log(`\n✓ school ${schoolCode} (${school.Name}): ${sped.size} SpEd students (144/144x)\n`);

    const students = await client.getSchoolStudents(schoolCode, {
      fields: [
        'StudentID',
        'StateStudentID',
        'FirstName',
        'LastName',
        'Grade',
        'Birthdate',
        'InactiveStatusCode',
      ],
    });
    const spedStudents = students.filter((s) => sped.has(s.StudentID));

    console.log('Aeries record  →  Speddy students row (mapped):');
    for (const s of spedStudents.slice(0, 10)) {
      const flag = sped.get(s.StudentID);
      printMapping(s, flag?.beingEvaluated ?? false);
    }
    if (spedStudents.length > 10) {
      console.log(`  … and ${spedStudents.length - 10} more`);
    }
    return; // one school is enough for the spike
  }

  console.log('\nNo SpEd (144) students found across schools.');
}

function printMapping(s: RawAeriesStudent, beingEvaluated: boolean) {
  console.log(
    `  AeriesStudentID=${s.StudentID}  → initials=${toInitials(s.FirstName, s.LastName)}  ` +
      `grade_level=${s.Grade ?? '∅'}  ${beingEvaluated ? '[being evaluated 144x]' : ''}`,
  );
}

main().catch((err) => {
  console.error('Spike failed:', err);
  process.exitCode = 1;
});
