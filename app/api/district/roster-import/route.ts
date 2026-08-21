import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { requireDistrictAdmin } from '@/lib/api/district-admin-gate';
import { BodyTooLargeError, declaresOversizedBody, readCappedFormData } from '@/lib/api/body-limit';
import { MAX_UPLOAD_FILE_BYTES } from '@/lib/import/parse-files';
import { MAX_FILE_SIZE_MB } from '@/lib/import/detect-import-file';
import { logger } from '@/lib/logger';
import { formatDateLocal } from '@/lib/utils/date-helpers';
import { planDistrictRoster, writableRosterChangeCount } from '@/lib/district-roster/plan';
import { readDistrictRosterFiles } from '@/lib/district-roster/roster-files';
import {
  applyDistrictRosterPlan,
  loadDistrictRosterContext,
  rosterPlanCounts,
  rosterPlanDigest,
  RosterApplyError,
} from '@/lib/district-roster/roster-import';

export const runtime = 'nodejs';

// A whole district's roster: parse two files, read every child in the
// district, then write. Creates go in chunks, but updates are one round trip
// each, so a large district refreshing thousands of students needs the same
// ceiling the other long-running district routes use rather than a minute.
export const maxDuration = 300;

const log = logger.child({ module: 'district-roster-import' });

/** Five files at the per-file cap, plus ~1 MB for multipart framing. */
const MAX_TOTAL_BYTES = MAX_UPLOAD_FILE_BYTES * 5 + 1024 * 1024;

const TOO_LARGE = `Upload too large. Each file must be under ${MAX_FILE_SIZE_MB} MB.`;

/**
 * POST /api/district/roster-import — the district admin's Preview → Publish
 * for the SEIS roster (SPE-447).
 *
 * The admin uploads the two district-wide SEIS exports (Student Goals and IEP
 * Dates), reviews one district-wide summary, and publishes it in a single
 * action. Publishing writes CHILD records only: who is in special education in
 * this district, their grade, school, district student ID and review dates.
 *
 * IT NEVER TOUCHES A CASELOAD. A `students` row is one provider's own service
 * entry — `upsert_students_atomic` refuses to write one unless the caller IS
 * that provider — so providers claim from the roster afterwards. That split is
 * what lets this import run and re-run without changing anything a provider
 * has entered.
 *
 * DISTRICT ADMINS ONLY, through the shared gate: this surface serves student
 * PII across every school in the district and creates real records, both well
 * outside the tech role's integrations-only line (SPE-393). There is no
 * /internal twin — student-level detail stays inside the district's own portal.
 *
 * Publish recomputes the plan server-side from the files posted with it,
 * refuses a plan-level refusal outright, and is count-bound to the reviewed
 * preview (409 on drift). Logs stay counts-only; names and initials exist only
 * in the response, for the reviewing admin.
 */
export const POST = withRoute({
  // Each run parses two district-wide exports and reads every child in the
  // district — keep the ceiling low.
  rateLimit: { requests: 6, windowSeconds: 60, name: 'district-roster-import' },
}, async ({ req: request, userId }) => {
  const gate = await requireDistrictAdmin(userId, {
    logLabel: 'district roster import',
    adminOnlyMessage: 'Forbidden: importing the district roster is for district admins.',
  });
  if (!gate.ok) return gate.response;
  const { districtId } = gate;

  // Reject an over-ceiling multipart body before it is buffered; the real cap
  // is counted while reading, since a client can omit or understate the header.
  if (declaresOversizedBody(request, MAX_TOTAL_BYTES)) {
    return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await readCappedFormData(request, MAX_TOTAL_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json({ error: TOO_LARGE }, { status: 413 });
    }
    throw err;
  }

  // A form field can carry a plain string under a file's name. Reading `.name`
  // off one would throw and answer 500 for what is really a malformed request.
  const isUploadedFile = (value: unknown): value is File =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as File).name === 'string' &&
    typeof (value as File).arrayBuffer === 'function';

  const FILE_FIELDS = [
    'goalsFile',
    'datesFile',
    'servicesFile',
    'accommodationsFile',
    'testingFile',
  ] as const;
  const uploads: Record<(typeof FILE_FIELDS)[number], File | null> = {
    goalsFile: null,
    datesFile: null,
    servicesFile: null,
    accommodationsFile: null,
    testingFile: null,
  };
  for (const field of FILE_FIELDS) {
    const value = form.get(field);
    if (value === null) continue;
    if (!isUploadedFile(value)) {
      return NextResponse.json(
        { error: `"${field}" was not sent as a file. Choose your SEIS export and try again.` },
        { status: 400 },
      );
    }
    uploads[field] = value;
  }

  for (const field of FILE_FIELDS) {
    const file = uploads[field];
    if (file && typeof file.size === 'number' && file.size > MAX_UPLOAD_FILE_BYTES) {
      return NextResponse.json(
        { error: `"${file.name}" exceeds the ${MAX_FILE_SIZE_MB} MB limit.` },
        { status: 413 },
      );
    }
  }

  const mode = form.get('mode') === 'publish' ? 'publish' : 'preview';
  const expectedRaw = form.get('expectedChanges');
  const expectedChanges =
    typeof expectedRaw === 'string' && /^\d+$/.test(expectedRaw) ? Number(expectedRaw) : null;
  const expectedDigestRaw = form.get('planDigest');
  const expectedDigest =
    typeof expectedDigestRaw === 'string' && /^[0-9a-f]{32}$/.test(expectedDigestRaw)
      ? expectedDigestRaw
      : null;
  if (mode === 'publish' && (expectedChanges === null || expectedDigest === null)) {
    return NextResponse.json(
      { error: 'Publishing needs the preview you reviewed. Run the preview again.' },
      { status: 400 },
    );
  }

  const files = await readDistrictRosterFiles(uploads);
  if (files.error) {
    return NextResponse.json({ error: files.error }, { status: 400 });
  }

  // Wrapped: withRoute's dev-mode catch echoes error.message, and a failure
  // here can carry table names or database detail.
  let context;
  try {
    context = await loadDistrictRosterContext(districtId);
  } catch (err) {
    log.error('Reading the district roster context failed', err, { districtId });
    return NextResponse.json(
      {
        error:
          'Speddy could not finish reading your district records. Nothing was written — ' +
          'try again in a moment.',
      },
      { status: 502 },
    );
  }

  const plan = planDistrictRoster({
    districtId,
    today: formatDateLocal(new Date()),
    goalsStudents: files.goalsStudents,
    datesRecords: files.datesRecords,
    servicesStudents: files.servicesStudents,
    accommodationsStudents: files.accommodationsStudents,
    testingStudents: files.testingStudents,
    schools: context.schools,
    existingChildren: context.existingChildren,
  });

  log.info('District roster planned', {
    districtId,
    actorId: userId,
    mode,
    filesRead: files.read,
    plan: rosterPlanCounts(plan),
  });

  const planDigest = rosterPlanDigest(plan);

  if (mode === 'preview') {
    return NextResponse.json({
      mode: 'preview',
      plan,
      planDigest,
      fileWarnings: files.warnings,
    });
  }

  if (plan.refusal) {
    return NextResponse.json({ error: `Nothing can be published: ${plan.refusal}` }, { status: 409 });
  }

  // Bound to the reviewed plan two ways. The count carries the message a human
  // can act on; the digest is the actual binding, because a count alone cannot
  // tell two different plans apart — a different file with the same total, or a
  // create and an update trading places in the database, would both slip past it.
  const writable = writableRosterChangeCount(plan);
  if (writable !== expectedChanges || planDigest !== expectedDigest) {
    log.info('District roster publish refused: the plan moved since the preview', {
      districtId,
      expected: expectedChanges,
      recomputed: writable,
      digestMatched: planDigest === expectedDigest,
    });
    return NextResponse.json(
      {
        error:
          writable !== expectedChanges
            ? `Your district's records changed since the preview (${expectedChanges} change(s) ` +
              `approved, ${writable} now planned). Nothing was written — run the preview again.`
            : 'This is not the roster you previewed — the files or your district records have ' +
              'changed. Nothing was written; run the preview again.',
      },
      { status: 409 },
    );
  }

  // Wrapped so a mid-publish failure answers honestly and SANITIZED: the
  // writer's stop-on-failure error carries database detail that withRoute's
  // dev-mode catch would echo, and by this point earlier chunks may have
  // committed — "nothing was written" would be a lie.
  let written;
  try {
    written = await applyDistrictRosterPlan({ plan, actorId: userId, districtId });
  } catch (err) {
    log.error('Publishing the district roster failed partway', err, { districtId });
    // Say how far it got, not "some may be saved": the writer reports its
    // progress, and a re-run of the preview shows exactly what is left.
    const progress = err instanceof RosterApplyError ? err.progress : null;
    return NextResponse.json(
      {
        error: progress
          ? `Publishing stopped partway: ${progress.created} student(s) had been added and ` +
            `${progress.updated} updated before the error — those are saved; nothing else ` +
            'changed. Run the preview again to see exactly what is left.'
          : 'Publishing hit an error partway — some students may already be saved. ' +
            'Run the preview again; it shows the current state.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ mode: 'publish', plan, written, fileWarnings: files.warnings });
});
