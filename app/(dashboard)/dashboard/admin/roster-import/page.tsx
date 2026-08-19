'use client';

/**
 * District admin → Student roster (SPE-447).
 *
 * One place for the district to put its whole special-education roster into
 * Speddy, from the two reports SEIS already exports district-wide — instead of
 * every provider downloading and uploading their own slice of the same files.
 *
 * The page writes nothing itself: it uploads to `/api/district/roster-import`,
 * which is where the district-admin gate and every database write live.
 */

import DistrictRosterImportPanel from '@/app/components/admin/district-roster-import-panel';

export default function DistrictRosterImportPage() {
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

      <DistrictRosterImportPanel />
    </div>
  );
}
