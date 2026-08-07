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

  // Logged either way: a staff member checking this during an incident wants the
  // check itself in the record, not just its answer.
  if (result.ok) {
    log.info('SIS encryption key self-test passed');
  } else {
    log.warn('SIS encryption key self-test failed', { problem: result.problem });
  }

  // 200 on a failed self-test on purpose: the request succeeded and its answer
  // is "the key is broken". A 500 here would be indistinguishable from the
  // route itself failing, which is the exact ambiguity this route exists to end.
  return NextResponse.json(result);
});
