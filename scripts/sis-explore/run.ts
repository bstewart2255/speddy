/**
 * SPE-398 · `npm run sis:explore -- --district=<id>`
 *
 * The "not blind" tooling from SPE-392. Point it at a district with a stored
 * SIS connection and it answers, in order:
 *
 *   1. Does our student number mean their student number?
 *   2. How much of the caseload can the SIS actually enrich?
 *   3. How many teachers does a secondary student really have?
 *   4. Does the district's special-education flag agree with our caseload?
 *
 * Internal only. No product UI, read-only against both the SIS and Speddy.
 *
 * OUTPUT, and why it is split. The terminal gets aggregates; the full report,
 * which carries student-level district IDs, goes to a git-ignored file. The
 * realistic way the PII rule breaks is someone pasting a terminal transcript
 * into a ticket, so the terminal simply never holds the identifiers.
 *
 * Usage:
 *   npm run sis:explore -- --district=SIM-D001
 *   npm run sis:explore -- --district=SIM-D001 --out=/tmp/report.md
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve, sep } from 'path';
import { AeriesClient } from '@/lib/integrations/aeries';
import { OneRosterClient } from '@/lib/integrations/oneroster';
import {
  analyzeIdSemantics,
  analyzeMatchRate,
  analyzeSpedFlags,
  analyzeTeacherLinkage,
  type IdSemanticsReport,
} from './analysis';
import { detailIds, renderFull, renderSummary, type Findings } from './report';
import {
  fetchAeries,
  fetchOneRoster,
  loadConnection,
  loadSchools,
  loadSpeddyStudents,
  loadSpeddyTeacherEmails,
  type IdCandidate,
  type SisSnapshot,
} from './sources';

/** Git-ignored (see .gitignore) — reports carry district student IDs. */
const DEFAULT_OUT_DIR = 'sis-reports';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}

/**
 * Pick the identifier field that actually lines up with what providers typed.
 *
 * Ranked by real overlap, not by which field we expected to win: the whole
 * reason report 1 exists is that the expectation is unreliable, and a district
 * whose providers copied StateStudentID would otherwise get a 0% match rate
 * that reads like their data is broken.
 */
function chooseCandidate(
  candidates: IdCandidate[],
  speddy: Parameters<typeof analyzeIdSemantics>[0],
): { chosen: IdCandidate; report: IdSemanticsReport; all: { field: string; report: IdSemanticsReport }[] } {
  const all = candidates.map((c) => ({ field: c.field, report: analyzeIdSemantics(speddy, c.students) }));
  if (all.length === 0) {
    throw new Error('The SIS snapshot offered no identifier fields to compare.');
  }
  let best = 0;
  for (let i = 1; i < all.length; i++) {
    if (all[i].report.overlap > all[best].report.overlap) best = i;
  }
  return { chosen: candidates[best], report: all[best].report, all };
}

/**
 * Decide where the full report may be written.
 *
 * The privacy control for this tool IS the ignore rule, and `--out=report.md`
 * would have written student IDs into a tracked directory while the CLI
 * cheerfully printed "that file is git-ignored". So a path inside the repo is
 * accepted only under the ignored directory; anywhere outside the repo is the
 * caller's own business and is allowed.
 */
export function resolveOutPath(
  requested: string | undefined,
  districtId: string,
  sisType: string,
): string {
  const repoRoot = resolve(__dirname, '..', '..');
  if (!requested) {
    return resolve(repoRoot, DEFAULT_OUT_DIR, `${districtId}-${sisType}.md`);
  }

  const target = resolve(requested);
  const inRepo = target === repoRoot || target.startsWith(repoRoot + sep);
  if (!inRepo) return target;

  const allowed = resolve(repoRoot, DEFAULT_OUT_DIR);
  if (target === allowed || target.startsWith(allowed + sep)) return target;

  throw new Error(
    `Refusing to write a student-level report to ${target}.\n` +
      `Inside the repository, reports may only go under ${DEFAULT_OUT_DIR}/ — the only path ` +
      'git ignores. Pass an --out path outside the repository, or drop --out entirely.',
  );
}

async function main(): Promise<void> {
  const districtId = arg('district');
  if (!districtId) {
    console.error('Usage: npm run sis:explore -- --district=<districtId> [--out=<path.md>]');
    process.exit(2);
  }

  console.log(`\nSIS exploration · district ${districtId}`);
  console.log('Read-only. Nothing is written to Speddy tables or to the SIS.\n');

  // Validated BEFORE any fetching. A run makes real requests against a
  // district's production SIS; discovering the output path is refusable only
  // after all of them is a waste of their server and the operator's time.
  const outPath = resolveOutPath(arg('out'), districtId, 'pending');

  const { connection, credential } = await loadConnection(districtId);
  console.log(`Connection: ${connection.sis_type} · ${connection.base_url ?? '(no base url)'}\n`);

  let snapshot: SisSnapshot;
  if (credential.sisType === 'aeries') {
    if (!connection.base_url) throw new Error('The stored Aeries connection has no base URL.');
    snapshot = await fetchAeries(
      new AeriesClient({ baseUrl: connection.base_url, certificate: credential.certificate }),
    );
  } else {
    if (!connection.base_url || !connection.token_url) {
      throw new Error('The stored OneRoster connection is missing its base or token URL.');
    }
    snapshot = await fetchOneRoster(
      new OneRosterClient({
        baseUrl: connection.base_url,
        tokenUrl: connection.token_url,
        clientId: credential.clientId,
        clientSecret: credential.clientSecret,
      }),
    );
  }

  const [speddy, schools, speddyTeacherEmails] = await Promise.all([
    loadSpeddyStudents(districtId),
    loadSchools(districtId),
    loadSpeddyTeacherEmails(districtId),
  ]);

  const { chosen, report: idSemantics, all } = chooseCandidate(snapshot.candidates, speddy);
  // Derived AFTER the field is chosen — teacher links and special-education
  // flags have to live in the same namespace the analysis joins on.
  const derived = snapshot.forField(chosen.field);

  // Speddy teacher → SIS teacher, by email. Built here rather than in the
  // analysis so the analysis stays pure and the "we could not resolve this
  // teacher" bucket is fed by a real join instead of an assumption.
  const sisTeacherByEmail = new Map<string, string>();
  for (const [key, email] of snapshot.teacherEmails) sisTeacherByEmail.set(email, key);
  const speddyTeacherToSisKey = new Map<string, string>();
  for (const [teacherId, email] of speddyTeacherEmails) {
    const sisKey = sisTeacherByEmail.get(email);
    if (sisKey) speddyTeacherToSisKey.set(teacherId, sisKey);
  }

  const findings: Findings = {
    districtId,
    sisType: credential.sisType,
    source: `stored connection · identifier field: ${chosen.field}`,
    idSemantics,
    matchRate: analyzeMatchRate(speddy, chosen.students),
    teacherLinkage: analyzeTeacherLinkage(
      speddy,
      chosen.students,
      derived.teacherLinks,
      schools,
      speddyTeacherToSisKey,
    ),
    spedFlags:
      credential.sisType === 'aeries' && derived.spedDistrictIds
        ? analyzeSpedFlags(speddy, derived.spedDistrictIds)
        : undefined,
  };

  // Aggregates only — safe to paste.
  console.log(renderSummary(findings));

  console.log('\n## Identifier fields tried\n');
  for (const c of all) {
    console.log(`- ${c.field}: ${c.report.overlap} of ${c.report.speddyIdsEntered} matched` +
      (c.field === chosen.field ? '  ← used' : ''));
  }

  if (snapshot.notes.length) {
    console.log('\n## Gaps in this run\n');
    for (const n of snapshot.notes) console.log(`- ${n}`);
  }

  // Re-resolved now the SIS type is known, so the default filename names it.
  // Already proven acceptable above; this cannot newly throw for a custom path.
  const out = arg('out') ? outPath : resolveOutPath(undefined, districtId, connection.sis_type);
  mkdirSync(dirname(out), { recursive: true });
  // 0600: the report is student-level PII on a shared machine.
  writeFileSync(out, renderFull(findings), { encoding: 'utf8', mode: 0o600 });

  const n = detailIds(findings).length;
  console.log(`\nFull report (${n} student-level ID(s)) written to:\n  ${out}`);
  console.log('Contains district student IDs. Do not paste it into Linear or a chat.');
}

// Only when invoked as a CLI. Without this guard, importing anything from this
// file — a test of `resolveOutPath`, say — runs the whole exploration.
if (require.main === module) {
  main().catch((err) => {
    console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
