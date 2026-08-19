'use client';

import { useState } from 'react';

/**
 * Types come from the planner module, never re-declared: `import type` is
 * erased at compile time, so no server-only code reaches this bundle and the
 * shapes cannot drift from what the route actually returns.
 */
import type { RosterException, RosterPlan } from '@/lib/district-roster/plan';

interface RosterResponse {
  mode: 'preview' | 'publish';
  plan: RosterPlan;
  written?: { created: number; updated: number };
  fileWarnings?: string[];
}

function isRosterResponse(value: unknown): value is RosterResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { mode?: unknown; plan?: unknown };
  if (body.mode !== 'preview' && body.mode !== 'publish') return false;
  if (typeof body.plan !== 'object' || body.plan === null) return false;
  const plan = body.plan as { counts?: unknown; children?: unknown };
  if (typeof plan.counts !== 'object' || plan.counts === null) return false;
  return Array.isArray(plan.children);
}

/**
 * Local copy of the server's `writableRosterChangeCount` (that module pulls in
 * server-only helpers and cannot enter this bundle). Drift fails loudly rather
 * than quietly: publishing is count-bound, so a mismatched copy 409s instead of
 * writing a set the admin never saw.
 */
const writableCount = (plan: RosterPlan): number =>
  plan.refusal ? 0 : plan.counts.creates + plan.counts.updates;

const EXCEPTION_HEADINGS: Record<RosterException['kind'], string> = {
  'missing-grade': 'No grade in either file',
  'unknown-school': 'School not in your district in Speddy',
  'ambiguous-name-match': 'Two students share this name at one school',
  'conflicting-district-id': 'Already has a different district student ID',
};

function FilePicker({
  id,
  label,
  hint,
  file,
  onPick,
  disabled,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onPick: (file: File | null) => void;
  disabled: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900">
        {label}
      </label>
      <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      <input
        id={id}
        type="file"
        accept=".csv,text/csv"
        disabled={disabled}
        onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        className="mt-2 block w-full text-xs text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-200 disabled:opacity-50"
      />
      {file && <p className="mt-1 text-xs text-slate-400">{file.name}</p>}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone?: string }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${tone ?? 'border-slate-200 bg-white'}`}>
      <p className="text-lg font-semibold leading-tight text-slate-900">{n}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

/**
 * District-admin roster import (SPE-447).
 *
 * The district admin uploads the two SEIS exports, reviews one district-wide
 * summary, and publishes it in a single action. Publishing writes the
 * district's student RECORDS — it never adds anyone to a provider's caseload,
 * and it never removes a student Speddy already has.
 */
export default function DistrictRosterImportPanel() {
  const [goalsFile, setGoalsFile] = useState<File | null>(null);
  const [datesFile, setDatesFile] = useState<File | null>(null);
  const [running, setRunning] = useState<'preview' | 'publish' | null>(null);
  const [result, setResult] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (mode: 'preview' | 'publish') => {
    const form = new FormData();
    form.append('mode', mode);
    if (goalsFile) form.append('goalsFile', goalsFile);
    if (datesFile) form.append('datesFile', datesFile);

    if (mode === 'publish') {
      const plan = result?.plan;
      if (!plan) return;
      const changes = writableCount(plan);
      const confirmed = window.confirm(
        `Publish this roster?\n\nSpeddy will add ${plan.counts.creates} student(s) and update ` +
          `${plan.counts.updates}. Nothing is removed: the ${plan.notInRoster.length} student(s) ` +
          'your files did not mention are left exactly as they are, and no provider caseload changes.',
      );
      if (!confirmed) return;
      form.append('expectedChanges', String(changes));
    }

    setRunning(mode);
    setError(null);
    if (mode === 'preview') setResult(null);

    // Above the route's own ceiling (maxDuration = 60s), so the browser never
    // gives up on a run the server can still finish.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 70_000);
    try {
      const res = await fetch('/api/district/roster-import', {
        method: 'POST',
        cache: 'no-store',
        signal: abort.signal,
        body: form,
      });
      const json: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          typeof (json as { error?: unknown })?.error === 'string'
            ? (json as { error: string }).error
            : `The roster import could not run (HTTP ${res.status}).`,
        );
        return;
      }
      if (!isRosterResponse(json)) {
        // On publish, "nothing was written" is a claim we cannot make — the
        // server may have finished and answered in a shape we failed to read.
        setError(
          mode === 'publish'
            ? 'The response could not be read, so the outcome is unknown. Run the preview again — it shows the current state.'
            : 'The preview returned an unreadable response. Nothing was written.',
        );
        return;
      }
      setResult(json);
    } catch {
      setError(
        mode === 'publish'
          ? 'The connection dropped mid-publish, so the outcome is unknown — it may have finished on the server. Run the preview again; it shows the current state.'
          : 'Could not reach the roster import. Nothing was written.',
      );
    } finally {
      clearTimeout(timer);
      setRunning(null);
    }
  };

  const plan = result?.plan ?? null;
  const canPreview = (goalsFile !== null || datesFile !== null) && running === null;
  const canPublish = plan !== null && result?.mode === 'preview' && writableCount(plan) > 0;

  const exceptionsByKind = new Map<RosterException['kind'], RosterException[]>();
  for (const e of plan?.exceptions ?? []) {
    exceptionsByKind.set(e.kind, [...(exceptionsByKind.get(e.kind) ?? []), e]);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Your two SEIS reports</p>
        <p className="mt-0.5 max-w-3xl text-xs text-slate-500">
          Export both as CSV. The Student Goals report carries each student&apos;s district ID,
          grade and school; the IEP Dates report carries the annual review and triennial dates.
          Either one on its own works — together they give the fullest roster.
        </p>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <FilePicker
            id="roster-goals-file"
            label="Student Goals report"
            hint="District ID, grade, school of attendance"
            file={goalsFile}
            onPick={setGoalsFile}
            disabled={running !== null}
          />
          <FilePicker
            id="roster-dates-file"
            label="IEP Dates report"
            hint="Next annual review and reevaluation dates"
            file={datesFile}
            onPick={setDatesFile}
            disabled={running !== null}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => run('preview')}
            disabled={!canPreview}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            {running === 'preview' ? 'Reading your files…' : 'Preview (no changes)'}
          </button>
          {canPublish && (
            <button
              type="button"
              onClick={() => run('publish')}
              disabled={running !== null}
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
            >
              {running === 'publish'
                ? 'Publishing…'
                : `Publish ${writableCount(plan!)} change(s)`}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      <div role="status" aria-live="polite" className="contents">
        {result && (
          <div className="space-y-3">
            {plan?.refusal && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Nothing to publish — {plan.refusal}
              </div>
            )}

            {result.mode === 'publish' && result.written && (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Published. {result.written.created} student(s) added, {result.written.updated}{' '}
                updated. No caseloads changed.
              </div>
            )}

            {result.fileWarnings && result.fileWarnings.length > 0 && (
              <details className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <summary className="cursor-pointer text-xs font-medium text-amber-800">
                  {result.fileWarnings.length} note(s) about your files
                </summary>
                <ul className="mt-1 space-y-0.5 pl-4 text-xs text-amber-800/80">
                  {result.fileWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </details>
            )}

            {plan && !plan.refusal && (
              <>
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {plan.counts.inFiles} student(s) in your files
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat
                      n={plan.counts.creates}
                      label="new to Speddy"
                      tone="border-emerald-200 bg-emerald-50"
                    />
                    <Stat
                      n={plan.counts.updates}
                      label="details to update"
                      tone="border-sky-200 bg-sky-50"
                    />
                    <Stat n={plan.counts.unchanged} label="already current" />
                    <Stat
                      n={plan.exceptions.length}
                      label="need your attention"
                      tone={
                        plan.exceptions.length > 0 ? 'border-amber-200 bg-amber-50' : undefined
                      }
                    />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    What this roster tells you
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Stat n={plan.compliance.overdueAnnualReviews} label="annual reviews overdue" />
                    <Stat n={plan.compliance.overdueTriennials} label="triennials overdue" />
                    <Stat
                      n={plan.compliance.missingAnnualReviewDate}
                      label="no review date on file"
                    />
                    <Stat n={plan.compliance.servedByNobody} label="on nobody's caseload" />
                    <Stat
                      n={plan.compliance.cannotLinkToTeachers}
                      label="no district ID, so no teacher link"
                    />
                    <Stat n={plan.notInRoster.length} label="in Speddy, not in your files" />
                  </div>
                </div>

                {exceptionsByKind.size > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-xs font-medium text-amber-900">
                      {plan.exceptions.length} student(s) Speddy will not add. Nothing about them
                      changes.
                    </p>
                    {[...exceptionsByKind.entries()].map(([kind, list]) => (
                      <details key={kind} className="mt-1.5">
                        <summary className="cursor-pointer text-xs font-medium text-amber-800">
                          {EXCEPTION_HEADINGS[kind]} ({list.length})
                        </summary>
                        <ul className="mt-1 space-y-0.5 pl-4 text-xs text-amber-800/80">
                          {list.map((e, i) => (
                            <li key={`${e.initials}:${i}`}>
                              {e.initials}
                              {e.gradeLevel ? ` · grade ${e.gradeLevel}` : ''} — {e.detail}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ))}
                  </div>
                )}

                {plan.notInRoster.length > 0 && (
                  <details className="rounded-md border border-slate-200 bg-white px-3 py-2.5">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700">
                      {plan.notInRoster.length} student(s) in Speddy that your files did not
                      mention — left exactly as they are
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-500">
                      {plan.notInRoster.map((c, i) => (
                        <li key={`${c.initials}:${i}`}>
                          {c.initials}
                          {c.gradeLevel ? ` · grade ${c.gradeLevel}` : ''} —{' '}
                          {c.caseloadCount === 0
                            ? 'on no caseload'
                            : `on ${c.caseloadCount} caseload(s)`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
