import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { speddyAdminDenialReason } from '@/lib/api/speddy-admin-denial-reason';
import { logger } from '@/lib/logger';
import { SIS_CONNECTION_NOT_FOUND, getConnection, setDpaCleared } from '@/lib/sis/connections';

const log = logger.child({ module: 'internal-sis-dpa' });

/**
 * Record or revoke a district's signed DPA (SPE-395).
 *
 * This is the gate that opens credential intake: until a Speddy operator has
 * the signed agreement on file and flips this, the database itself refuses to
 * hold a credential for the district. Speddy staff only — a district's own
 * admins must not be able to clear their own DPA.
 *
 * Revoking is destructive by design: it deletes the stored credentials, because
 * leaving a live SIS certificate behind a gate that has just closed is the one
 * outcome nobody wants. The UI confirms before calling this.
 */
export const PATCH = withRoute<{ connectionId: string }, { cleared: boolean }>(
  { body: z.object({ cleared: z.boolean() }) },
  async ({ userId, body, params }) => {
    const denied = await speddyAdminDenialReason(userId);
    if (denied) {
      log.warn('Non-speddy-admin tried to change a DPA', {
        userId,
        connectionId: params.connectionId,
        denied,
      });
      return NextResponse.json(
        { error: 'Forbidden: Speddy admin access required' },
        { status: 403 }
      );
    }

    try {
      await setDpaCleared({
        connectionId: params.connectionId,
        actorId: userId,
        cleared: body.cleared,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update DPA state';
      log.error('Failed to update DPA state', {
        connectionId: params.connectionId,
        error: message,
      });
      if (message === SIS_CONNECTION_NOT_FOUND) {
        return NextResponse.json({ error: SIS_CONNECTION_NOT_FOUND }, { status: 404 });
      }
      // Fixed message, not `message`: a PostgREST error carries constraint,
      // column and foreign-key names. The detail belongs in the log line above.
      return NextResponse.json({ error: 'Failed to update DPA state' }, { status: 500 });
    }

    log.info('DPA state changed', {
      connectionId: params.connectionId,
      cleared: body.cleared,
      actorId: userId,
    });

    // Return the row the write produced rather than what the client assumed, so
    // the switch reflects the database instead of an optimistic guess.
    //
    // Guarded separately because the write has ALREADY committed here. Letting a
    // failed read-back reject the request would report a successful DPA change
    // as a failure, and the panel would keep showing the old state — the worst
    // possible outcome on a control whose "off" position deletes credentials.
    try {
      const connection = await getConnection(params.connectionId);
      return NextResponse.json({ connection });
    } catch (err) {
      log.error('DPA change committed but the read-back failed', {
        connectionId: params.connectionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json({ connection: null });
    }
  }
);
