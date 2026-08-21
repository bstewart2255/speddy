'use client';

/**
 * District admin → Student roster (SPE-447, SPE-587).
 *
 * Two things, in the order a district actually needs them.
 *
 * The roster ITSELF is the standing content: which published students reach no
 * provider, and why. That answer used to exist only for as long as the import's
 * review screen stayed open — a district admin who navigated away had no way
 * back to it short of re-uploading their files, so students nobody picked up
 * simply went quiet. It now loads on every visit.
 *
 * Uploading is the periodic action, so once a roster exists the uploader
 * collapses to a single line above it.
 *
 * The page writes nothing itself: it reads `/api/district/roster-gaps` and
 * uploads to `/api/district/roster-import`, which is where the district-admin
 * gate and every database write live.
 */

import { useCallback, useState } from 'react';

import DistrictRosterImportPanel from '@/app/components/admin/district-roster-import-panel';
import DistrictRosterGapsPanel from '@/app/components/admin/district-roster-gaps-panel';

export default function DistrictRosterPage() {
  // Null until the gaps panel reports back — the uploader stays collapsed while
  // it is unknown, and only springs open for a district that has never
  // published. "Never published" is the last-publish timestamp and NOT the
  // number of children: a provider's own caseload rows create children too, so
  // a district with plenty of them may never have uploaded anything.
  const [lastPublishedAt, setLastPublishedAt] = useState<string | null>(null);
  const [hasPublished, setHasPublished] = useState<boolean | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const handleLoaded = useCallback(
    (summary: { totalOnRoster: number; lastPublishedAt: string | null }) => {
      setLastPublishedAt(summary.lastPublishedAt);
      setHasPublished(summary.lastPublishedAt !== null);
    },
    [],
  );

  const handlePublished = useCallback(() => setRefreshToken((n) => n + 1), []);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Student roster</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          Upload your district-wide SEIS reports once, and every school&apos;s students are in
          Speddy with their grade, school, district ID and review dates. You see exactly what
          would change before anything is written. Publishing never adds a student to a
          provider&apos;s caseload and never removes one Speddy already has.
        </p>
      </div>

      <DistrictRosterImportPanel
        hasPublished={hasPublished}
        lastPublishedAt={lastPublishedAt}
        onPublished={handlePublished}
      />

      <DistrictRosterGapsPanel refreshToken={refreshToken} onLoaded={handleLoaded} />
    </div>
  );
}
