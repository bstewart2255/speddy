'use client';

import { useState } from 'react';

/**
 * Types imported from the sync module, never re-declared — a hand-copy would
 * let the panel and the planner drift with nothing failing the build. `import
 * type` is erased at compile time, so no server-only code reaches the bundle
 * (same pattern as the key-health card in sis-connections-panel.tsx).
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

/**
 * Validated rather than asserted: an off-shape 200 would otherwise render an
 * empty plan as "nothing to create", which reads as a verdict and is not one.
 */
function isTeacherSyncResponse(value: unknown): value is TeacherSyncResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { mode?: unknown; plan?: unknown };
  if (body.mode !== 'dry-run' && body.mode !== 'apply') return false;
  if (typeof body.plan !== 'object' || body.plan === null) return false;
  return Array.isArray((body.plan as { schools?: unknown }).schools);
}

function writableCount(plan: TeacherSyncPlan): number {
  return plan.schools
    .filter((s) => !s.refusal)
    .reduce((sum, s) => sum + s.creates.length + s.adopts.length + s.updates.length, 0);
}

function CountChip({ label, n, tone }: { label: string; n: number; tone: string }) {
  if (n === 0) return null;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs ${tone}`}>
      {n} {label}
    </span>
  );
}

function SchoolSection({ school }: { school: SchoolPlan }) {
  return (
    <div className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
      <p className="text-sm font-medium text-white">
        {school.schoolName}
        {school.sisSchoolName && (
          <span className="ml-2 text-xs font-normal text-slate-400">
            ← SIS “{school.sisSchoolName}”
          </span>
        )}
      </p>

      {school.refusal ? (
        <p className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-200">
          Not synced — {school.refusal}
        </p>
      ) : (
        <>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <CountChip
              label="to create"
              n={school.creates.length}
              tone="bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
            />
            <CountChip
              label="to adopt (stamp SIS key on an existing row)"
              n={school.adopts.length}
              tone="bg-sky-500/10 text-sky-300 border-sky-500/30"
            />
            <CountChip
              label="to update"
              n={school.updates.length}
              tone="bg-sky-500/10 text-sky-300 border-sky-500/30"
            />
            <CountChip
              label="unchanged"
              n={school.unchanged}
              tone="bg-slate-500/10 text-slate-300 border-slate-500/30"
            />
            <CountChip
              label="need review — never auto-matched"
              n={school.reviews.length}
              tone="bg-amber-500/10 text-amber-300 border-amber-500/30"
            />
            <CountChip
              label="in Speddy but gone from the SIS (never deleted)"
              n={school.missingFromSis.length}
              tone="bg-slate-500/10 text-slate-300 border-slate-500/30"
            />
            <CountChip
              label="excluded: non-teaching staff"
              n={school.excludedNonTeaching}
              tone="bg-slate-600/10 text-slate-400 border-slate-600/30"
            />
          </div>

          {school.creates.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-slate-300">
                Teachers to create ({school.creates.length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-400">
                {school.creates.map((c) => (
                  <li key={c.sisId}>
                    <span className="text-slate-200">
                      {c.firstName} {c.lastName}
                    </span>
                    {c.email && <> · {c.email}</>}
                    {c.staffId && <> · {c.staffId}</>}
                    {c.gradeLevel && <> · grades {c.gradeLevel}</>}
                  </li>
                ))}
              </ul>
            </details>
          )}

          {school.adopts.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-300">
                Existing rows to adopt ({school.adopts.length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-400">
                {school.adopts.map((a) => (
                  <li key={a.sisId}>
                    <span className="text-slate-200">{a.name}</span> · {a.email} — same email
                    already in Speddy; only the SIS key is stamped.
                  </li>
                ))}
              </ul>
            </details>
          )}

          {school.updates.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-300">
                SIS-owned rows to update ({school.updates.length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-400">
                {school.updates.map((u) => (
                  <li key={u.sisId}>
                    <span className="text-slate-200">{u.name}</span> ·{' '}
                    {Object.keys(u.changes).join(', ')} changed
                  </li>
                ))}
              </ul>
            </details>
          )}

          {school.reviews.length > 0 && (
            <details className="mt-1" open>
              <summary className="cursor-pointer text-xs text-amber-300">
                Needs a human ({school.reviews.length}) — name matches, email does not
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-amber-200/80">
                {school.reviews.map((r) => (
                  <li key={r.sisId}>
                    SIS “{r.feedName}” ({r.feedEmail ?? 'no email'}) vs existing “{r.existingName}”
                    ({r.existingEmail ?? 'no email'}) — nothing written either way.
                  </li>
                ))}
              </ul>
            </details>
          )}

          {school.missingFromSis.length > 0 && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-slate-300">
                In Speddy, gone from the SIS ({school.missingFromSis.length})
              </summary>
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-400">
                {school.missingFromSis.map((m) => (
                  <li key={m.teacherId}>{m.name} — left in place; deleting is a human call.</li>
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
 * Teacher-directory sync for an OneRoster connection (SPE-437).
 *
 * Two deliberate clicks: PREVIEW fetches the live feed and shows the exact
 * per-school diff without writing anything; APPLY re-plans server-side and
 * writes creates + adopts + keyed updates only. The plan shown is the review
 * artifact — the concierge model's "owner sees it before it lands".
 */
export default function TeacherSyncCard({ connectionId }: { connectionId: string }) {
  const [running, setRunning] = useState<'dry-run' | 'apply' | null>(null);
  const [result, setResult] = useState<TeacherSyncResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'dry-run' | 'apply') => {
    if (mode === 'apply') {
      const plan = result?.plan;
      if (!plan) return;
      const confirmed = window.confirm(
        `Apply the teacher sync?\n\nThis writes ${writableCount(plan)} change(s) to the live ` +
          'teacher directory (creates, adoptions, and updates shown in the preview). ' +
          'Review rows and refused schools are not touched.',
      );
      if (!confirmed) return;
    }

    setRunning(mode);
    setError(null);
    if (mode === 'dry-run') setResult(null);

    // Bounded above the server's worst case (full pagination against a
    // district SIS), for the same reason the connection test is: a shorter
    // deadline reports "nothing happened" about a run the server completes.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 180_000);
    try {
      const res = await fetch(`/api/internal/sis-connections/${connectionId}/teacher-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: abort.signal,
        body: JSON.stringify({ mode }),
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
        setError('The sync returned an unreadable response. Nothing was written.');
        return;
      }
      setResult(json);
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      setError(
        timedOut
          ? mode === 'apply'
            ? 'Gave up waiting for the district’s SIS. The apply may still be running — re-run the preview before trying again.'
            : 'Gave up waiting for the district’s SIS. Try the preview again in a moment.'
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
    <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-white">Teacher directory sync</p>
          <p className="mt-0.5 text-xs text-slate-400">
            Fills each school’s teacher list from the OneRoster feed — real teacher rows only
            (staff-ID rule, SPE-437). Preview shows the exact diff and writes nothing.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run('dry-run')}
            disabled={running !== null}
            className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {running === 'dry-run' ? 'Previewing…' : 'Preview sync (no writes)'}
          </button>
          {canApply && (
            <button
              type="button"
              onClick={() => run('apply')}
              disabled={running !== null}
              className="px-3 py-2 text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-md transition-colors"
            >
              {running === 'apply' ? 'Applying…' : `Apply ${writableCount(plan)} change(s)`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300"
        >
          {error}
        </div>
      )}

      {/* Mounted unconditionally with only its CONTENT conditional — the
          aria-live rule the rest of this panel follows. */}
      <div role="status" aria-live="polite" className="contents">
        {result && (
          <div className="mt-3 space-y-2">
            {result.mode === 'apply' && result.written && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
                Applied.{' '}
                {result.written
                  .map((w) => `${w.schoolName}: ${w.created} created, ${w.adopted} adopted, ${w.updated} updated`)
                  .join(' · ') || 'Nothing was writable.'}
              </div>
            )}

            {plan?.schools.map((school) => (
              <SchoolSection key={school.schoolId} school={school} />
            ))}

            <p className="text-xs text-slate-500">
              Feed: {plan?.feedTeacherRows} teacher row(s) of {plan?.feedTotalRows} staff row(s).
              {plan && plan.unmappedSisSchools.length > 0 && (
                <>
                  {' '}
                  Skipped SIS schools with no Speddy counterpart:{' '}
                  {plan.unmappedSisSchools
                    .map((s) => `${s.name} (${s.teacherRows} teacher rows)`)
                    .join(', ')}
                  .
                </>
              )}
              {plan && plan.shadowDuplicates > 0 && (
                <>
                  {' '}
                  {plan.shadowDuplicates} duplicate staff listing(s) resolved to their teacher row.
                </>
              )}
              {plan && plan.duplicateEmailAnomalies > 0 && (
                <>
                  {' '}
                  {plan.duplicateEmailAnomalies} row(s) skipped for a repeated email at one school.
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
