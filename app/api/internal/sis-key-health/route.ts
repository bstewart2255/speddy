import { NextResponse } from 'next/server';
import { withRoute } from '@/lib/api/with-route';
import { speddyAdminDenialReason } from '@/lib/api/speddy-admin-denial-reason';
import { logger } from '@/lib/logger';
import { sisCredentialEncryptionSelfTest } from '@/lib/sis/credential-crypto';

const log = logger.child({ module: 'internal-sis-key-health' });

/**
 * GET /api/internal/sis-key-health — can this deployment encrypt SIS credentials?
 *
 * Exists because the failure it reports on is invisible from everywhere else
 * (SPE-420, after SPE-417). A district's Aeries certificate was refused in
 * production because SIS_CREDENTIAL_ENCRYPTION_KEY was not live on the running
 * build; the Vercel dashboard showed the variable present, because it WAS
 * present — just not on the build serving traffic. A missing key and a key
 * damaged by a stray newline on paste produce the same symptom there too. This
 * route is the one place that tells those apart on the deployment actually
 * answering requests.
 *
 * Deliberately reports on the ENVIRONMENT, never on anyone's data:
 *
 *  - no district is named, accepted, or read — there is no input at all;
 *  - no credential is written, read, or decrypted; the round trip uses a fixed
 *    non-secret probe and never leaves memory;
 *  - it grants no new power. Credentials still never come through /internal —
 *    only a district's own tech admin enters those, which is the boundary that
 *    keeps a mistake in the staff panel from reaching a district's row.
 *
 * A GET with no parameters, so it is safe to click twice.
 */
export const GET = withRoute({}, async ({ userId }) => {
  const denied = await speddyAdminDenialReason(userId);
  if (denied) {
    log.warn('Non-speddy-admin tried to read SIS key health', { userId, denied });
    return NextResponse.json(
      { error: 'Forbidden: Speddy admin access required' },
      { status: 403 },
    );
  }

  const result = sisCredentialEncryptionSelfTest();

  // Logged either way, with the actor: during an incident with several staff in
  // the panel, a verdict nobody can be matched to is half a record.
  if (result.ok) {
    log.info('SIS encryption key self-test passed', { userId });
  } else {
    // error, not warn: lib/logger.ts only forwards to Sentry from error, so a
    // warn here would make the purpose-built detector quieter than the accident
    // it replaced — a broken key would produce 200s and no alert anywhere.
    log.error('SIS encryption key self-test failed', new Error(result.problem), { userId });
  }

  // 200 on a failed self-test on purpose: the request succeeded and its answer
  // is "the key is broken". A 500 here would be indistinguishable from the
  // route itself failing, which is the exact ambiguity this route exists to end.
  //
  // The build is named in the answer because "which deployment said this?" is
  // the same question one level down: a staff member who clicks this on a
  // preview URL while verifying an env-var fix would otherwise get a green that
  // says nothing about the build serving districts.
  return NextResponse.json(
    {
      ...result,
      deployment: {
        commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
        checkedAt: new Date().toISOString(),
      },
    },
    // A point-in-time diagnostic must never be answered from a cache: a replayed
    // verdict from before an env-var fix is precisely the false reassurance this
    // route exists to end. Next adds no cache header of its own here, and the
    // response is per-user authorized (403 vs 200 on one URL).
    { headers: { 'Cache-Control': 'no-store' } },
  );
});
