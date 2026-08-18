'use client';

import { useState } from 'react';

/**
 * Types imported from the sync module, never re-declared (same rule as the
 * internal card and the directories page): `import type` is erased at compile
 * time, so no server-only code reaches the bundle.
 */
import type {
  SchoolPlan,
  SchoolWriteResult,
  TeacherSyncPlan,
} from '@/lib/sis/teacher-directory-sync';

interface TeacherSyncResponse {
  mode: 'dry-run' | 'apply';
  plan: TeacherSyncPlan;
  written?: SchoolWriteResult[];
}

function isTeacherSyncResponse(value: unknown): value is TeacherSyncResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { mode?: unknown; plan?: unknown; written?: unknown };
  if (body.mode !== 'dry-run' && body.mode !== 'apply') return false;
  if (typeof body.plan !== 'object' || body.plan === null) return false;
  if (!Array.isArray((body.plan as { schools?: unknown }).schools)) return false;
  // `written` renders its new fields directly — a malformed 200 must land in
  // the "unreadable response" branch, not throw mid-render.
  if (body.written !== undefined) {
    if (!Array.isArray(body.written)) return false;
    for (const entry of body.written) {
      const w = entry as { accountsCreated?: unknown; accountConflicts?: unknown };
      if (typeof w?.accountsCreated !== 'number' || !Array.isArray(w?.accountConflicts)) {
        return false;
      }
    }
  }
  return true;
}

// Local copy of the server's `writableChangeCount` (that module is
// server-only and cannot enter this bundle). Drift fails loudly: apply is
// count-bound, so a mismatched copy 409s instead of writing the wrong set.
const writableCount = (plan: TeacherSyncPlan): number =>
  plan.schools
    .filter((s) => !s.refusal)
    .reduce((sum, s) => sum + s.creates.length + s.adopts.length + s.updates.length, 0);

const accountCount = (plan: TeacherSyncPlan): number =>
  plan.schools
    .filter((s) => !s.refusal)
    .reduce((sum, s) => sum + s.creates.filter((c) => c.email).length, 0);

function Chip({ label, n, tone }: { label: string; n: number; tone: string }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {n} {label}
    </span>
  );
}

function SchoolSection({ school }: { school: SchoolPlan }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-sm font-medium text-slate-900">
        {school.schoolName}
        {school.sisSchoolName && (
          <span className="ml-2 text-xs font-normal text-slate-400">
            from SIS “{school.sisSchoolName}”
          </span>
        )}
      </p>

      {school.refusal ? (
        <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          Not synced — {school.refusal}
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Chip
              label="teachers to add"
              n={school.creates.length}
              tone="bg-emerald-50 text-emerald-700 border-emerald-200"
            />
            <Chip
              label="with sign-in access"
              n={school.creates.filter((c) => c.email).length}
              tone="bg-emerald-50 text-emerald-700 border-emerald-200"
            />
            <Chip
              label="existing entries to link"
              n={school.adopts.length}
              tone="bg-sky-50 text-sky-700 border-sky-200"
            />
            <Chip
              label="to update"
              n={school.updates.length}
              tone="bg-sky-50 text-sky-700 border-sky-200"
            />
            <Chip
              label="already up to date"
              n={school.unchanged}
              tone="bg-slate-50 text-slate-600 border-slate-200"
            />
            <Chip
              label="need your review"
              n={school.reviews.length}
              tone="bg-amber-50 text-amber-700 border-amber-200"
            />
            <Chip
              label="in Speddy but not in your SIS (kept)"
              n={school.missingFromSis.length}
              tone="bg-slate-50 text-slate-600 border-slate-200"
            />
            <Chip
              label="non-teaching staff skipped"
              n={school.excludedNonTeaching}
              tone="bg-slate-50 text-slate-500 border-slate-200"
            />
          </div>

          {school.creates.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                Teachers to add ({school.creates.length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-500">
                {school.creates.map((c) => (
                  <li key={c.sisId}>
                    <span className="text-slate-800">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.email ? <> · {c.email}</> : <> · no email — directory entry only</>}
                    {c.staffId && <> · {c.staffId}</>}
                    {c.gradeLevel && <> · grade {c.gradeLevel}</>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {school.reviews.length > 0 && (
            <details className="mt-1" open>
              <summary className="cursor-pointer text-xs font-medium text-amber-700">
                Needs your review ({school.reviews.length}) — nothing written for these
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-amber-800/80">
                {school.reviews.map((r) => (
                  <li key={`${r.sisId}:${r.existingTeacherId}`}>
                    SIS “{r.feedName}” ({r.feedEmail ?? 'no email'}) vs existing “{r.existingName}”
                    ({r.existingEmail ?? 'no email'}) —{' '}
                    {r.reason === 'ambiguous-email'
                      ? 'more than one existing entry shares this email.'
                      : 'the name matches but the email does not.'}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {school.missingFromSis.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs font-medium text-slate-600">
                In Speddy, not in your SIS ({school.missingFromSis.length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-500">
                {school.missingFromSis.map((m) => (
                  <li key={m.teacherId}>{m.name} — left in place; removing is your call.</li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

/**
 * District-admin Preview → Apply for the teacher sync (SPE-438).
 *
 * The owner's model: the SIS says who the teachers are, so Apply makes them
 * OFFICIAL in one step — directory entry plus a ready sign-in account, no
 * temp-password ceremony. Teachers are never emailed by this; they sign in
 * with Google or use "Forgot password" whenever the school tells them to.
 */
export default function DistrictTeacherSyncPanel() {
  const [running, setRunning] = useState<'dry-run' | 'apply' | null>(null);
  const [result, setResult] = useState<TeacherSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'dry-run' | 'apply') => {
    let expectedChanges: number | undefined;
    if (mode === 'apply') {
      const plan = result?.plan;
      if (!plan) return;
      expectedChanges = writableCount(plan);
      const accounts = accountCount(plan);
      const confirmed = window.confirm(
        `Apply the teacher sync?\n\nThis makes ${expectedChanges} change(s) to your teacher ` +
          `lists, including ${accounts} teacher(s) who will get sign-in access. No emails are ` +
          'sent — teachers can sign in with Google or use “Forgot password” when you tell them ' +
          'Speddy is ready. Rows needing your review are not touched.',
      );
      if (!confirmed) return;
    }

    setRunning(mode);
    setError(null);
    if (mode === 'dry-run') setResult(null);

    // Above the ROUTE'S own ceiling (maxDuration = 300s), so the browser
    // never gives up on a run the server can still finish (PR #886 review
    // — the old 180s sat below the ceiling while claiming to be above it).
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 310_000);
    try {
      const res = await fetch('/api/district/teacher-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: abort.signal,
        body: JSON.stringify(mode === 'apply' ? { mode, expectedChanges } : { mode }),
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const message =
          typeof (json as { error?: unknown })?.error === 'string'
            ? (json as { error: string }).error
            : `The sync could not run (HTTP ${res.status}).`;
        setError(message);
        return;
      }
      if (!isTeacherSyncResponse(json)) {
        // On apply, "nothing was written" would be a claim we cannot make —
        // the server may have completed and answered in a shape we failed to
        // read. Honest guidance: re-preview and look at the current state.
        setError(
          mode === 'apply'
            ? 'The response could not be read, so the outcome is unknown. Run the preview again — it shows the current state.'
            : 'The preview returned an unreadable response. Nothing was written.',
        );
        return;
      }
      setResult(json);
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      // An apply that left the browser may have finished on the server —
      // "nothing was written" is only claimable for a preview.
      setError(
        mode === 'apply'
          ? 'The connection dropped mid-run, so the outcome is unknown — the sync may have finished on the server. Run the preview again; it shows the current state.'
          : timedOut
            ? 'Gave up waiting for your SIS. Try the preview again in a moment.'
            : 'Could not reach the sync. Nothing was written.',
      );
    } finally {
      clearTimeout(timer);
      setRunning(null);
    }
  };

  const plan = result?.plan ?? null;
  const canApply = plan !== null && result?.mode === 'dry-run' && writableCount(plan) > 0;
  // School-scoped keys: the same email can legitimately conflict at two
  // schools (multi-school teachers plan one row per school).
  const conflicts = (result?.written ?? []).flatMap((w) =>
    w.accountConflicts.map((c) => ({ ...c, schoolId: w.schoolId })),
  );

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Teacher sync</p>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Fills each school&apos;s teacher list from your SIS and gives every teacher sign-in
            access, in one step. Preview first — it shows exactly what would change and writes
            nothing. No emails are sent to teachers.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run('dry-run')}
            disabled={running !== null}
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {running === 'dry-run' ? 'Previewing…' : 'Preview (no changes)'}
          </button>
          {canApply && (
            <button
              type="button"
              onClick={() => run('apply')}
              disabled={running !== null}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {running === 'apply' ? 'Applying…' : `Apply ${writableCount(plan)} change(s)`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <div role="status" aria-live="polite" className="contents">
        {result && (
          <div className="mt-3 space-y-2">
            {result.mode === 'apply' && result.written && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Done.{' '}
                {result.written
                  .map(
                    (w) =>
                      `${w.schoolName}: ${w.created} added (${w.accountsCreated} with sign-in), ` +
                      `${w.adopted} linked, ${w.updated} updated`,
                  )
                  .join(' · ') || 'Nothing needed writing.'}
              </div>
            )}

            {conflicts.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium">
                  {conflicts.length} teacher(s) added without sign-in — their email already has a
                  Speddy account:
                </p>
                <ul className="mt-1 list-disc pl-4">
                  {conflicts.map((c) => (
                    <li key={`${c.schoolId}:${c.email}`}>
                      {c.name} · {c.email}
                    </li>
                  ))}
                </ul>
                <p className="mt-1">
                  Usually this means the person already uses Speddy in another role. Nothing was
                  changed on the existing account.
                </p>
              </div>
            )}

            {plan?.schools.map((school) => (
              <SchoolSection key={school.schoolId} school={school} />
            ))}

            <p className="text-xs text-slate-400">
              From your SIS: {plan?.feedTeacherRows} teacher record(s) of {plan?.feedTotalRows}{' '}
              staff record(s).
              {plan?.teachingEvidence === 'unavailable' && (
                <>
                  {' '}
                  Class rosters couldn&apos;t be read this run, so staff without staff IDs were
                  judged on IDs alone.
                </>
              )}
              {plan && plan.unmappedSisSchools.length > 0 && (
                <>
                  {' '}
                  SIS schools not set up in Speddy:{' '}
                  {plan.unmappedSisSchools
                    .map((s) => `${s.name} (${s.teacherRows} teachers)`)
                    .join(', ')}
                  .
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
