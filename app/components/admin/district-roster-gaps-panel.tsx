'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Types come from the planner module, never re-declared, so the shapes cannot
 * drift from what the route actually returns. `GAP_KIND_ORDER` is a real import
 * rather than a copy for the same reason — a kind added to the planner shows up
 * here instead of being silently dropped by a stale local list. The module is
 * pure and IO-free, so nothing server-only reaches this bundle.
 */
import { GAP_KIND_ORDER } from '@/lib/district-roster/gaps';
import type { RosterGapGroup, RosterGapKind, RosterGaps } from '@/lib/district-roster/gaps';

interface GapsResponse {
  gaps: RosterGaps;
  lastPublishedAt: string | null;
}

/**
 * "Students not connected to a provider" — the district's standing roster view
 * (SPE-587).
 *
 * The import already knew this number and then threw it away: it lived on the
 * review screen and vanished the moment the admin navigated off, so the only
 * way back to it was to upload the files again. This panel asks the question on
 * every page load instead, and answers it grouped by CAUSE, because the causes
 * need four different people to do four different things.
 *
 * The group that justifies the view is the first one. A student whose SEIS case
 * manager is a district admin is not waiting on anyone — admins cannot hold a
 * caseload, so no provider is ever offered that student, and nothing in the
 * product would have mentioned them again.
 */

const KIND_COPY: Record<
  RosterGapKind,
  { heading: string; why: string; tone: string; pill: string }
> = {
  'case-manager-cannot-serve': {
    heading: 'Assigned to someone who cannot hold a caseload',
    why:
      'Your files name a case manager whose Speddy account is an admin, a teacher or a district tech account. Nobody is being offered these students to claim. Name a provider in SEIS and publish again, or ask a provider to pick them up directly.',
    tone: 'border-rose-200 bg-rose-50',
    pill: 'border-rose-200 bg-white text-rose-700',
  },
  'case-manager-at-another-school': {
    heading: 'Their case manager works at a different school',
    why:
      'The case manager is a provider in Speddy, but is not assigned to the school this student attends — and providers only ever see the roster at their own schools. Add them to that school, or ask a provider who works there to pick the student up.',
    tone: 'border-rose-200 bg-rose-50',
    pill: 'border-rose-200 bg-white text-rose-700',
  },
  'case-manager-not-in-speddy': {
    heading: 'No Speddy account matches the case manager',
    why:
      'Nobody in Speddy answers to the name your files give. Either that staff member still needs an account, or their name is spelled differently here than in SEIS.',
    tone: 'border-amber-200 bg-amber-50',
    pill: 'border-amber-200 bg-white text-amber-800',
  },
  'awaiting-provider-claim': {
    heading: 'Waiting on a provider to claim them',
    why:
      'The case manager is a provider at this student’s school, so nothing is stopping them — they have not picked the student up yet. A provider is offered a student whose services match their own specialty, so where the district listed no service this one delivers, a colleague in another specialty may be the one to nudge.',
    tone: 'border-sky-200 bg-sky-50',
    pill: 'border-sky-200 bg-white text-sky-800',
  },
  'no-case-manager': {
    heading: 'No case manager named in your files',
    why:
      'Nobody to chase. These are offered to every provider at the school whose discipline matches the services the district listed.',
    tone: 'border-slate-200 bg-white',
    pill: 'border-slate-200 bg-slate-50 text-slate-600',
  },
};

/** The order the groups arrive in, straight from the planner. */
const KIND_ORDER = GAP_KIND_ORDER;

function isGapsResponse(value: unknown): value is GapsResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { gaps?: unknown };
  if (typeof body.gaps !== 'object' || body.gaps === null) return false;
  const gaps = body.gaps as { groups?: unknown; totalOnRoster?: unknown };
  return Array.isArray(gaps.groups) && typeof gaps.totalOnRoster === 'number';
}

function GapGroup({ group }: { group: RosterGapGroup }) {
  const copy = KIND_COPY[group.kind];
  // A browser still holding the previous deploy's bundle after a new kind ships
  // would otherwise read `.tone` off undefined and take the whole panel down —
  // losing every group it DOES understand over one it doesn't.
  if (!copy) return null;
  return (
    <div className={`rounded-md border px-3 py-2.5 ${copy.tone}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-slate-900">
          {group.caseManager ?? 'No case manager named'}
          {group.accountName && (
            <span className="font-normal text-slate-500">
              {' '}
              &mdash; in Speddy as {group.accountName}
            </span>
          )}
          {group.accountRoleLabel && (
            <span className="font-normal text-slate-500"> &middot; {group.accountRoleLabel}</span>
          )}
        </p>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums ${copy.pill}`}
        >
          {group.studentCount}
        </span>
      </div>
      <ul className="mt-1.5 space-y-0.5 pl-4 text-xs text-slate-600">
        {group.students.map((student) => (
          <li key={student.childId}>
            {student.name || student.initials}
            {student.gradeLevel ? ` · grade ${student.gradeLevel}` : ''}
            {student.schoolName ? ` · ${student.schoolName}` : ''}
          </li>
        ))}
        {group.hiddenCount > 0 && (
          <li className="italic text-slate-400">
            and {group.hiddenCount} more, not listed here
          </li>
        )}
      </ul>
    </div>
  );
}

export default function DistrictRosterGapsPanel({
  refreshToken = 0,
  onLoaded,
}: {
  /** Bumped by the uploader after a publish, to re-ask the question. */
  refreshToken?: number;
  /** Reports roster size and last publish up, so the uploader knows how to show itself. */
  onLoaded?: (summary: { totalOnRoster: number; lastPublishedAt: string | null }) => void;
}) {
  const [data, setData] = useState<GapsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Kept out of the effect's dependencies deliberately. A parent that re-creates
  // `onLoaded` on every render would otherwise re-run the fetch, and the fetch
  // calls back into the parent — which is a loop, not a refresh.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/district/roster-gaps', { cache: 'no-store' });
        const json: unknown = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setError(
            typeof (json as { error?: unknown })?.error === 'string'
              ? (json as { error: string }).error
              : `Your roster could not be read (HTTP ${res.status}).`,
          );
          return;
        }
        if (!isGapsResponse(json)) {
          setError('Your roster could not be read. Try reloading the page.');
          return;
        }
        setData(json);
        onLoadedRef.current?.({
          totalOnRoster: json.gaps.totalOnRoster,
          lastPublishedAt: json.lastPublishedAt ?? null,
        });
      } catch {
        if (!cancelled) setError('Could not reach your roster. Check your connection and reload.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500"
      >
        Checking who is connected to a provider&hellip;
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700"
      >
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { gaps } = data;

  if (gaps.totalOnRoster === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
        No students in Speddy for your district yet. Upload your SEIS reports above, and this will
        show every student who is not connected to a provider.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          Students not connected to a provider
        </h2>
        <p className="text-xs tabular-nums text-slate-500">
          {gaps.totalUnserved} of {gaps.totalOnRoster} on the roster
        </p>
      </div>
      <p className="mt-0.5 max-w-3xl text-xs text-slate-500">
        Checked live every time you open this page &mdash; no upload needed. Nobody is serving these
        students in Speddy yet.
      </p>

      {gaps.totalUnserved === 0 ? (
        <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Every student on your roster is on a provider&apos;s caseload.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {KIND_ORDER.map((kind) => {
            const groups = gaps.groups.filter((g) => g.kind === kind);
            if (groups.length === 0) return null;
            const copy = KIND_COPY[kind];
            return (
              <section key={kind}>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-xs font-semibold text-slate-900">{copy.heading}</h3>
                  <span className="text-xs tabular-nums text-slate-500">
                    {/* Falls back to the groups themselves rather than trusting
                        `countsByKind` to be there: a response shape this client
                        doesn't fully know should cost a number, not the panel. */}
                    {gaps.countsByKind?.[kind] ??
                      groups.reduce((n, g) => n + g.studentCount, 0)}{' '}
                    student(s)
                  </span>
                </div>
                <p className="mt-0.5 max-w-3xl text-xs text-slate-500">{copy.why}</p>
                <div className="mt-1.5 space-y-1.5">
                  {groups.map((group) => (
                    <GapGroup key={`${group.kind}:${group.caseManager ?? ''}`} group={group} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
