'use client';

import { useState } from 'react';

/**
 * Types imported from the sync module, never re-declared (same rule as every
 * sync panel): `import type` is erased at compile time, so no server-only
 * code reaches the bundle.
 */
import type {
  LinkSchoolPlan,
  LinkSchoolWriteResult,
  LinkSyncPlan,
  UnmatchedChild,
} from '@/lib/sis/student-teacher-link-sync';

interface LinkSyncResponse {
  mode: 'dry-run' | 'apply';
  plan: LinkSyncPlan;
  written?: LinkSchoolWriteResult[];
}

function isLinkSyncResponse(value: unknown): value is LinkSyncResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { mode?: unknown; plan?: unknown; written?: unknown };
  if (body.mode !== 'dry-run' && body.mode !== 'apply') return false;
  if (typeof body.plan !== 'object' || body.plan === null) return false;
  if (!Array.isArray((body.plan as { schools?: unknown }).schools)) return false;
  if (body.written !== undefined && !Array.isArray(body.written)) return false;
  return true;
}

// Local copy of the server's `writableLinkChangeCount` (that module is
// server-only and cannot enter this bundle). Drift fails loudly: apply is
// count-bound, so a mismatched copy 409s instead of writing the wrong set.
const writableCount = (plan: LinkSyncPlan): number =>
  plan.refusal
    ? 0
    : plan.schools.reduce(
        (sum, s) => sum + s.adds.length + s.removes.length + s.relabels.length,
        0,
      );

const UNMATCHED_WORDING: Record<UnmatchedChild['reason'], string> = {
  'no-district-id': 'no district student ID recorded in Speddy',
  'conflicting-district-ids': 'caseload copies disagree on the district student ID',
  'not-in-sis': 'their district student ID is not in your SIS',
  'duplicate-in-sis': 'two SIS students share their district student ID',
};

function Chip({ label, n, tone }: { label: string; n: number; tone: string }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {n} {label}
    </span>
  );
}

function SchoolSection({ school }: { school: LinkSchoolPlan }) {
  if (school.caseloadChildren === 0) return null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-sm font-medium text-slate-900">
        {school.schoolName}
        <span className="ml-2 text-xs font-normal text-slate-400">
          {school.matchedChildren} of {school.caseloadChildren} student(s) matched
        </span>
      </p>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <Chip
          label="teacher link(s) to add"
          n={school.adds.length}
          tone="bg-emerald-50 text-emerald-700 border-emerald-200"
        />
        <Chip
          label="label(s) to update"
          n={school.relabels.length}
          tone="bg-sky-50 text-sky-700 border-sky-200"
        />
        <Chip
          label="outdated link(s) to remove"
          n={school.removes.length}
          tone="bg-rose-50 text-rose-700 border-rose-200"
        />
        <Chip
          label="already up to date"
          n={school.unchanged}
          tone="bg-slate-50 text-slate-600 border-slate-200"
        />
        <Chip
          label="added by hand — left alone"
          n={school.humanLinksKept}
          tone="bg-slate-50 text-slate-600 border-slate-200"
        />
      </div>

      {school.teachersNotInDirectory > 0 && (
        <p className="mt-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
          {school.teachersNotInDirectory} teacher assignment(s) name a teacher who isn&apos;t in
          this school&apos;s teacher list yet. Run the Teacher sync above first, then preview
          again.
        </p>
      )}

      {school.unmatched.length > 0 && (
        <details className="mt-1.5" open>
          <summary className="cursor-pointer text-xs font-medium text-amber-700">
            Students that couldn&apos;t be matched ({school.unmatched.length}) — nothing changes
            for them
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-amber-800/80">
            {school.unmatched.map((u, i) => (
              <li key={`${u.initials}:${u.reason}:${i}`}>
                {u.initials}
                {u.grade ? ` · grade ${u.grade}` : ''} — {UNMATCHED_WORDING[u.reason]}.
              </li>
            ))}
          </ul>
        </details>
      )}

      {school.noTeachersFound.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs font-medium text-slate-600">
            Matched, but your SIS lists no teachers for them ({school.noTeachersFound.length})
          </summary>
          <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-500">
            {school.noTeachersFound.map((s, i) => (
              <li key={`${s.initials}:${i}`}>
                {s.initials}
                {s.grade ? ` · grade ${s.grade}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * District-admin Preview → Apply for the student↔teacher link sync (SPE-540).
 *
 * Reads the SIS class rosters and connects each caseload student to their
 * classroom teachers. Links added by hand in Speddy are never touched; only
 * links this sync itself wrote are ever updated or removed on a later run.
 */
export default function DistrictLinkSyncPanel() {
  const [running, setRunning] = useState<'dry-run' | 'apply' | null>(null);
  const [result, setResult] = useState<LinkSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'dry-run' | 'apply') => {
    let expectedChanges: number | undefined;
    if (mode === 'apply') {
      const plan = result?.plan;
      if (!plan) return;
      expectedChanges = writableCount(plan);
      const removals = plan.schools.reduce((sum, s) => sum + s.removes.length, 0);
      const confirmed = window.confirm(
        `Apply the class roster sync?\n\nThis makes ${expectedChanges} change(s) to which ` +
          `teachers are listed for your students${
            removals > 0
              ? `, including removing ${removals} link(s) your SIS no longer shows`
              : ''
          }. Links added by hand in Speddy are never touched. Unmatched students are ` +
          'skipped entirely.',
      );
      if (!confirmed) return;
    }

    setRunning(mode);
    setError(null);
    if (mode === 'dry-run') setResult(null);

    // Above the server's worst case (three full SIS collections).
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 180_000);
    try {
      const res = await fetch('/api/district/link-sync', {
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
      if (!isLinkSyncResponse(json)) {
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

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Class roster sync</p>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Connects each student on a caseload to their classroom teachers, from your SIS class
            rosters. Run the Teacher sync first so every teacher is in the list. Preview shows
            exactly what would change and writes nothing; links added by hand are never touched.
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
            {plan?.refusal && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Not synced — {plan.refusal}
              </div>
            )}

            {result.mode === 'apply' && result.written && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Done.{' '}
                {result.written
                  .filter((w) => w.added + w.removed + w.relabeled > 0)
                  .map(
                    (w) =>
                      `${w.schoolName}: ${w.added} link(s) added, ${w.relabeled} updated, ` +
                      `${w.removed} removed`,
                  )
                  .join(' · ') || 'Nothing needed writing.'}
              </div>
            )}

            {!plan?.refusal &&
              plan?.schools.map((school) => (
                <SchoolSection key={school.schoolId} school={school} />
              ))}

            {!plan?.refusal && plan && (
              <p className="text-xs text-slate-400">
                From your SIS: {plan.feedStudents} student(s), {plan.liveClasses} class(es),{' '}
                {plan.studentEnrollments + plan.teacherEnrollments} roster entries.
                {plan.unplacedChildren > 0 && (
                  <> {plan.unplacedChildren} student(s) sit at no synced school — skipped.</>
                )}
                {plan.staleEnrollments > 0 && (
                  <> {plan.staleEnrollments} roster entr(ies) referenced classes that no longer exist.</>
                )}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
