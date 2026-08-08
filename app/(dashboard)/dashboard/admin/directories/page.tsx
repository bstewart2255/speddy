'use client';

/**
 * District admin → Directories (SPE-436). Read-only browser over the
 * district's own SIS data, live per request — the owner's Phase 0: see the
 * data populate cleanly BEFORE any of it flows into Speddy records.
 *
 * Everything shown here came through the server route's picked shapes; this
 * page adds no fields, stores nothing, and offers no actions but "look".
 */

import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/app/components/ui/card';

type Area = 'teachers' | 'students' | 'classes' | 'schools';

interface Stat {
  label: string;
  value: string;
}

interface PersonRow {
  sourcedId: string;
  name: string;
  email: string | null;
  identifier: string | null;
  grades: string[];
  schools: string[];
}

interface ClassRow {
  sourcedId: string;
  title: string;
  classType: string | null;
  subjects: string[];
  periods: string[];
  grades: string[];
}

interface SchoolRow {
  sourcedId: string;
  name: string;
  identifier: string | null;
  type: string | null;
}

interface Page {
  area: Area;
  rows: (PersonRow | ClassRow | SchoolRow)[];
  offset: number;
  pageFull: boolean;
  stats: Stat[];
}

const AREA_LABELS: Record<Area, string> = {
  teachers: 'Teachers',
  students: 'Students',
  classes: 'Classes',
  schools: 'Schools',
};

const AREAS: Area[] = ['teachers', 'students', 'classes', 'schools'];

const join = (values: string[]) => (values.length ? values.join(', ') : '—');
const dash = (value: string | null) => value ?? '—';

export default function DirectoriesPage() {
  const [area, setArea] = useState<Area>('teachers');
  const [rows, setRows] = useState<Page['rows']>([]);
  const [stats, setStats] = useState<Stat[]>([]);
  const [pageFull, setPageFull] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (target: Area, offset: number, append: boolean) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setNotice(null);
      setRows([]);
      setStats([]);
    }
    try {
      const res = await fetch(`/api/district/sis-directory?area=${target}&offset=${offset}`);
      const body = (await res.json()) as Page & { error?: string };
      if (!res.ok) {
        setNotice(body.error ?? 'Something went wrong loading this directory.');
        return;
      }
      setRows((prev) => (append ? [...prev, ...body.rows] : body.rows));
      setStats(body.stats);
      setPageFull(body.pageFull);
      setNextOffset(body.offset + body.rows.length);
    } catch {
      setNotice('Something went wrong loading this directory. Try again in a moment.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
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
                  <span className="font-semibold text-slate-900">{s.value}</span>
                  {s.label}
                </span>
              ))}
              {pageFull && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs text-amber-700">
                  Showing the first {rows.length} — counts describe what&apos;s loaded
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
                          <th className="py-2 pr-4">{area === 'teachers' ? 'Staff ID' : 'District ID'}</th>
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
                              {(row as PersonRow).name}
                            </td>
                            <td className="py-2 pr-4">{dash((row as PersonRow).email)}</td>
                            <td className="py-2 pr-4 font-mono text-xs">
                              {dash((row as PersonRow).identifier)}
                            </td>
                            <td className="py-2 pr-4">{join((row as PersonRow).grades)}</td>
                            <td className="py-2">{join((row as PersonRow).schools)}</td>
                          </>
                        )}
                        {area === 'classes' && (
                          <>
                            <td className="py-2 pr-4 font-medium text-slate-900">
                              {(row as ClassRow).title}
                            </td>
                            <td className="py-2 pr-4">{dash((row as ClassRow).classType)}</td>
                            <td className="py-2 pr-4">{join((row as ClassRow).subjects)}</td>
                            <td className="py-2 pr-4">{join((row as ClassRow).periods)}</td>
                            <td className="py-2">{join((row as ClassRow).grades)}</td>
                          </>
                        )}
                        {area === 'schools' && (
                          <>
                            <td className="py-2 pr-4 font-medium text-slate-900">
                              {(row as SchoolRow).name}
                            </td>
                            <td className="py-2 pr-4 font-mono text-xs">
                              {dash((row as SchoolRow).identifier)}
                            </td>
                            <td className="py-2">{dash((row as SchoolRow).type)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {pageFull && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => void load(area, nextOffset, true)}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-md bg-slate-100 text-sm font-medium text-slate-700 hover:bg-slate-200 disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
