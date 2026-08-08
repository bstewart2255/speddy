'use client';

/**
 * District admin → Directories (SPE-436). Read-only browser over the
 * district's own SIS data, live per request — the owner's Phase 0: see the
 * data populate cleanly BEFORE any of it flows into Speddy records.
 *
 * Everything shown here came through the server route's picked shapes; this
 * page adds no fields, stores nothing, and offers no actions but "look".
 * Row/stat types are imported type-only from the server module — erased at
 * build time, so the server-only code never enters the client bundle, and the
 * shapes cannot drift from what the route actually returns.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/app/components/ui/card';
import type {
  DirectoryArea,
  DirectoryClassRow,
  DirectoryPage,
  DirectoryPersonRow,
  DirectorySchoolRow,
  DirectoryStat,
} from '@/lib/sis/oneroster-directory';

const AREA_LABELS: Record<DirectoryArea, string> = {
  teachers: 'Teachers',
  students: 'Students',
  classes: 'Classes',
  schools: 'Schools',
};

const AREAS: DirectoryArea[] = ['teachers', 'students', 'classes', 'schools'];

const join = (values: string[]) => (values.length ? values.join(', ') : '—');
const dash = (value: string | null) => value ?? '—';
const formatStat = (s: DirectoryStat) => (s.of === undefined ? String(s.n) : `${s.n} of ${s.of}`);

/** Sum page stats by label, so badges describe everything loaded, not the last page. */
function sumStats(prev: DirectoryStat[], next: DirectoryStat[]): DirectoryStat[] {
  const byLabel = new Map(prev.map((s) => [s.label, { ...s }]));
  for (const stat of next) {
    const existing = byLabel.get(stat.label);
    if (!existing) {
      byLabel.set(stat.label, { ...stat });
    } else {
      existing.n += stat.n;
      if (existing.of !== undefined || stat.of !== undefined) {
        existing.of = (existing.of ?? 0) + (stat.of ?? 0);
      }
    }
  }
  return [...byLabel.values()];
}

export default function DirectoriesPage() {
  const [area, setArea] = useState<DirectoryArea>('teachers');
  const [rows, setRows] = useState<DirectoryPage['rows']>([]);
  const [stats, setStats] = useState<DirectoryStat[]>([]);
  const [nextOffset, setNextOffset] = useState(0);
  /** Last page had rows — more MAY exist. Never trusts the requested limit. */
  const [mayHaveMore, setMayHaveMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [appendNotice, setAppendNotice] = useState<string | null>(null);
  /**
   * Latest-request-wins: a slow response for a previous tab must not land in
   * the current one — person rows rendered under class columns is a crash.
   */
  const requestSeq = useRef(0);

  const load = useCallback(async (target: DirectoryArea, offset: number, append: boolean) => {
    const seq = ++requestSeq.current;
    if (append) {
      setLoadingMore(true);
      setAppendNotice(null);
    } else {
      setLoading(true);
      setNotice(null);
      setAppendNotice(null);
      setRows([]);
      setStats([]);
      setExhausted(false);
      setMayHaveMore(false);
    }
    try {
      const res = await fetch(`/api/district/sis-directory?area=${target}&offset=${offset}`);
      const body = (await res.json()) as DirectoryPage & { error?: string };
      if (seq !== requestSeq.current) return; // a newer request owns the screen
      if (!res.ok) {
        const message = body.error ?? 'Something went wrong loading this directory.';
        if (append) {
          setAppendNotice(message);
        } else {
          setNotice(message);
        }
        return;
      }
      setRows((prev) => (append ? [...prev, ...body.rows] : body.rows));
      setStats((prev) => (append ? sumStats(prev, body.stats) : body.stats));
      setNextOffset(offset + body.rows.length);
      setMayHaveMore(body.rows.length > 0);
      if (append && body.rows.length === 0) setExhausted(true);
    } catch {
      if (seq !== requestSeq.current) return;
      const message = 'Something went wrong loading this directory. Try again in a moment.';
      if (append) {
        setAppendNotice(message);
      } else {
        setNotice(message);
      }
    } finally {
      if (seq === requestSeq.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(area, 0, false);
  }, [area, load]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Directories</h1>
        <p className="text-sm text-slate-500 mt-1">
          What your district&apos;s SIS shares with Speddy, read live — nothing here is saved into
          Speddy yet.
        </p>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="Directory areas">
        {AREAS.map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={area === a}
            onClick={() => setArea(a)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              area === a
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {AREA_LABELS[a]}
          </button>
        ))}
      </div>

      <Card className="p-4">
        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">
            Reading {AREA_LABELS[area].toLowerCase()} from your SIS…
          </p>
        ) : notice ? (
          <p className="text-sm text-slate-600 py-8 text-center">{notice}</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              {stats.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-baseline gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600"
                >
                  <span className="font-semibold text-slate-900">{formatStat(s)}</span>
                  {s.label}
                </span>
              ))}
              {mayHaveMore && !exhausted && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                  Counts describe the {rows.length} loaded so far
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-slate-500 py-6 text-center">
                Your SIS answered, with nothing in this area.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200">
                      {(area === 'teachers' || area === 'students') && (
                        <>
                          <th className="py-2 pr-4">Name</th>
                          <th className="py-2 pr-4">Email</th>
                          <th className="py-2 pr-4">
                            {area === 'teachers' ? 'Staff ID' : 'District ID'}
                          </th>
                          <th className="py-2 pr-4">Grades</th>
                          <th className="py-2">School</th>
                        </>
                      )}
                      {area === 'classes' && (
                        <>
                          <th className="py-2 pr-4">Class</th>
                          <th className="py-2 pr-4">Type</th>
                          <th className="py-2 pr-4">Subjects</th>
                          <th className="py-2 pr-4">Periods</th>
                          <th className="py-2">Grades</th>
                        </>
                      )}
                      {area === 'schools' && (
                        <>
                          <th className="py-2 pr-4">School</th>
                          <th className="py-2 pr-4">Code</th>
                          <th className="py-2">Type</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((row) => (
                      <tr key={row.sourcedId} className="text-slate-700">
                        {(area === 'teachers' || area === 'students') && (
                          <>
                            <td className="py-2 pr-4 font-medium text-slate-900">
                              {(row as DirectoryPersonRow).name}
                            </td>
                            <td className="py-2 pr-4">{dash((row as DirectoryPersonRow).email)}</td>
                            <td className="py-2 pr-4 font-mono text-xs">
                              {dash((row as DirectoryPersonRow).identifier)}
                            </td>
                            <td className="py-2 pr-4">{join((row as DirectoryPersonRow).grades)}</td>
                            <td className="py-2">{join((row as DirectoryPersonRow).schools)}</td>
                          </>
                        )}
                        {area === 'classes' && (
                          <>
                            <td className="py-2 pr-4 font-medium text-slate-900">
                              {(row as DirectoryClassRow).title}
                            </td>
                            <td className="py-2 pr-4">{dash((row as DirectoryClassRow).classType)}</td>
                            <td className="py-2 pr-4">{join((row as DirectoryClassRow).subjects)}</td>
                            <td className="py-2 pr-4">{join((row as DirectoryClassRow).periods)}</td>
                            <td className="py-2">{join((row as DirectoryClassRow).grades)}</td>
                          </>
                        )}
                        {area === 'schools' && (
                          <>
                            <td className="py-2 pr-4 font-medium text-slate-900">
                              {(row as DirectorySchoolRow).name}
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs">
                              {dash((row as DirectorySchoolRow).identifier)}
                            </td>
                            <td className="py-2">{dash((row as DirectorySchoolRow).type)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {mayHaveMore && !exhausted && rows.length > 0 && (
              <div className="mt-4 text-center space-y-2">
                <button
                  onClick={() => void load(area, nextOffset, true)}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-md bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
                {appendNotice && <p className="text-xs text-amber-700">{appendNotice}</p>}
              </div>
            )}
            {exhausted && rows.length > 0 && (
              <p className="mt-4 text-center text-xs text-slate-400">
                That&apos;s everything your SIS lists here.
              </p>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
