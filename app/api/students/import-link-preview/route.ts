import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { resolveOneRosterConnection } from '@/lib/sis/connections';
import { loadLinkPreviewInput, previewTeacherLinks } from '@/lib/sis/import-link-preview';

// Full SIS pagination — same ceiling as every route that runs the walk.
export const maxDuration = 300;

const log = logger.child({ module: 'import-link-preview' });

const bodySchema = z.object({
  schoolId: z.string().min(1).max(64),
  districtStudentIds: z
    .array(z.string().trim().min(1).max(64))
    .min(1)
    // A review screen's worth, not a bulk export: sized to the largest real
    // caseload file seen (~100 rows) with headroom. Together with the rate
    // limit this bounds how fast the endpoint can be used as a lookup tool
    // for ids outside an import (PR #896 review — see the route doc).
    .max(150),
});

/**
 * POST /api/students/import-link-preview — "which teachers will these
 * students get?", answered for the import review screen (SPE-546).
 *
 * PROVIDER-scoped, read-only: the caller must have access to the school
 * (the same accessible-schools test the import confirm applies), the
 * DISTRICT is resolved server-side from that school — a request can never
 * name a district — and nothing is written anywhere. Districts without a
 * working OneRoster setup answer `{ available: false }` rather than an
 * error: the review screen simply doesn't grow the column.
 *
 * The response carries teacher names and class labels keyed by the posted
 * district IDs — directory data the provider already sees wherever teachers
 * appear. Logs stay counts-only.
 */
export const POST = withRoute<Record<string, string>, z.infer<typeof bodySchema>>(
  {
    body: bodySchema,
    // Every run walks the district's production SIS to completion.
    rateLimit: { requests: 4, windowSeconds: 60, name: 'import-link-preview' },
  },
  async ({ userId, body }) => {
    const supabase = await createClient();

    // The same school-access seam the import confirm gates on.
    const { data: accessibleSchools, error: schoolsError } = await supabase.rpc(
      'user_accessible_school_ids',
    );
    if (schoolsError) {
      log.error('Could not check school access for the link preview', schoolsError, { userId });
      return NextResponse.json({ error: 'Could not check school access.' }, { status: 500 });
    }
    const accessible = new Set(
      (accessibleSchools ?? []).map((s: { school_id: string }) => s.school_id),
    );
    if (!accessible.has(body.schoolId)) {
      log.warn('Link preview refused: school not accessible to caller', { userId });
      return NextResponse.json(
        { error: 'You do not have access to this school.' },
        { status: 403 },
      );
    }

    // School → district from OUR table; the request never names a district.
    const { data: schoolRow, error: schoolError } = await supabase
      .from('schools')
      .select('district_id')
      .eq('id', body.schoolId)
      .maybeSingle();
    if (schoolError) {
      log.error('Could not resolve the school for the link preview', schoolError, { userId });
      return NextResponse.json({ error: 'Could not check this school.' }, { status: 500 });
    }
    const districtId = schoolRow?.district_id ? String(schoolRow.district_id) : null;
    if (!districtId) {
      // reason 'no-sis': the column should not appear at all — there is no
      // sync coming later, so "will link after import" would be false.
      return NextResponse.json({ available: false, reason: 'no-sis' });
    }

    const resolved = await resolveOneRosterConnection(districtId);
    if (resolved.status !== 'connected') {
      // No SIS wired up (or its setup is broken) — the review screen just
      // stays as it is today. Not an error a provider can act on.
      log.info('Link preview unavailable', { districtId, reason: resolved.status });
      return NextResponse.json({ available: false, reason: 'no-sis' });
    }

    let input;
    try {
      input = await loadLinkPreviewInput(
        {
          districtId: resolved.connection.district_id,
          baseUrl: resolved.connection.base_url,
          tokenUrl: resolved.connection.token_url,
          clientId: resolved.credential.clientId,
          clientSecret: resolved.credential.clientSecret,
        },
        body.schoolId,
      );
    } catch (err) {
      // A slow or refusing SIS degrades to "links will be added after
      // import" — never an error and never upstream text a provider sees.
      log.warn('Link preview could not read the SIS', {
        connectionId: resolved.connection.id,
        reason: err instanceof Error ? err.message : 'unknown',
      });
      // reason 'sis-unreachable': a sync IS configured, so the honest column
      // state is "Will link after import", not a vanished column.
      return NextResponse.json({ available: false, reason: 'sis-unreachable' });
    }

    const entries = previewTeacherLinks(input, body.districtStudentIds);
    log.info('Import link preview served', {
      connectionId: resolved.connection.id,
      idsAsked: body.districtStudentIds.length,
      matched: Object.values(entries).filter((e) => e.status === 'matched').length,
    });
    return NextResponse.json({ available: true, entries });
  },
);
