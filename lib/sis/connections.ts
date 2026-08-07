/**
 * Server-side access to `district_sis_connections` (SPE-395).
 *
 * This is the ONLY place a real credential is encrypted, decrypted, or written.
 * (One other caller touches the cipher: `sisCredentialEncryptionSelfTest()`,
 * behind the /internal staff gate, which round-trips a fixed non-secret probe
 * in memory — it reads and writes no credential and no row, so the audit-trail
 * guarantee below is unaffected. Stated here because "grep the encrypt/decrypt
 * call sites" is how a rotation runbook or a security review starts.) The
 * tech-portal flows (SPE-396 Aeries, SPE-397 OneRoster) and the exploration
 * tooling (SPE-398) call in here rather than touching the table, so there is a
 * single audited path and a single place holding the key.
 *
 * Why a module rather than "just query the table":
 *   - browsers cannot write this table at all (every write policy is `false`),
 *     so every mutation is server-side by construction;
 *   - the credential columns are withheld from `authenticated` by column-level
 *     grants, so reads of them must come through the service role;
 *   - every mutation is an auditable event on a district's SIS access, and
 *     routing them through one module is what makes an audit trail something
 *     the code guarantees rather than something each caller remembers.
 *
 * Server-only: uses the service-role client and the encryption key. Never
 * import from a client component. (The repo has no `server-only` package, so
 * this is a convention, same as lib/calendar/token-crypto.ts — but it fails
 * closed in practice: SUPABASE_SERVICE_ROLE_KEY is not in the client bundle,
 * so createServiceClient() throws if this ever runs in a browser.)
 */
import { createServiceClient } from '@/lib/supabase/server';
import { logServerAuditEvent } from '@/lib/supabase/audit-log-server';
import { logger } from '@/lib/logger';
import {
  credentialHint,
  decryptSisCredential,
  encryptSisCredential,
  sisCredentialEncryptionProblem,
} from './credential-crypto';

const log = logger.child({ module: 'sis-connections' });

export type SisType = 'aeries' | 'oneroster';

/**
 * Thrown when an operation names a connection that does not exist.
 *
 * Exported so routes can map it to a 404 by identity. Matching on the message
 * text instead would silently degrade to a 500 the day someone rewords the
 * string, and nothing would link the two files to warn them.
 */
export const SIS_CONNECTION_NOT_FOUND = 'SIS connection not found';

/**
 * What may be recorded about a connection test.
 *
 * Deliberately narrow rather than `unknown`. `last_test_result` is one of the
 * columns granted to `authenticated`, so anything written here is readable by
 * that district's staff — and a failing SIS call can echo the submitted
 * credential back in its response body. A type is the only thing that stops a
 * future caller spreading a raw provider response into it: Postgres cannot tell
 * a certificate from a diagnostics blob, and a doc comment does not fail a
 * build. (lib/integrations/aeries/client.ts already discards response bodies
 * for the same reason.)
 */
export interface SisTestResult {
  status?: number;
  area?: string;
  message?: string;
}

export type SisConnectionStatus =
  | 'pending_dpa'
  | 'awaiting_credentials'
  | 'testing'
  | 'connected'
  | 'error'
  | 'disabled';

/** Everything a client may see. Deliberately has no credential fields. */
export interface SisConnectionSummary {
  id: string;
  district_id: string;
  sis_type: SisType;
  base_url: string | null;
  token_url: string | null;
  credential_hint: string | null;
  status: SisConnectionStatus;
  dpa_cleared_at: string | null;
  last_tested_at: string | null;
  last_test_result: unknown | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * The exact column list a client may read. Mirrors the GRANT in the migration.
 *
 * Named explicitly rather than using `*`: `select('*')` is REFUSED for a
 * browser session (it expands to columns it may not read), and a server-side
 * `*` would quietly pull credentials into memory in places that have no
 * business holding them.
 */
const SUMMARY_COLUMNS =
  'id, district_id, sis_type, base_url, token_url, credential_hint, status, dpa_cleared_at, last_tested_at, last_test_result, created_by, created_at, updated_at';

/** Connections for a district — status only, never credentials. */
export async function listConnections(
  districtId: string
): Promise<SisConnectionSummary[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('district_sis_connections')
    .select(SUMMARY_COLUMNS)
    .eq('district_id', districtId)
    .order('sis_type');

  if (error) throw new Error(`Failed to load SIS connections: ${error.message}`);
  return (data ?? []) as SisConnectionSummary[];
}

/** A single connection by id — status only, never credentials. */
export async function getConnection(
  connectionId: string
): Promise<SisConnectionSummary | null> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('district_sis_connections')
    .select(SUMMARY_COLUMNS)
    .eq('id', connectionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load SIS connection: ${error.message}`);
  return (data as SisConnectionSummary | null) ?? null;
}

/**
 * Decrypt a stored credential for server-side use — a connection test, or a
 * real SIS call.
 *
 * Returns null when the connection has no credential yet, which is an ordinary
 * state (pending_dpa / awaiting_credentials), not an error. Callers must treat
 * the result as short-lived: use it for the request at hand and let it go.
 */
export async function getDecryptedCredential(
  connectionId: string
): Promise<
  | { sisType: 'aeries'; certificate: string }
  | { sisType: 'oneroster'; clientId: string; clientSecret: string }
  | null
> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('district_sis_connections')
    .select(
      'sis_type, aeries_certificate_encrypted, oneroster_client_id_encrypted, oneroster_client_secret_encrypted'
    )
    .eq('id', connectionId)
    .maybeSingle();

  if (error) throw new Error(`Failed to load SIS credential: ${error.message}`);
  if (!data) return null;

  if (data.sis_type === 'aeries') {
    if (!data.aeries_certificate_encrypted) return null;
    return {
      sisType: 'aeries',
      certificate: decryptSisCredential(data.aeries_certificate_encrypted),
    };
  }

  if (!data.oneroster_client_id_encrypted || !data.oneroster_client_secret_encrypted) {
    return null;
  }
  return {
    sisType: 'oneroster',
    clientId: decryptSisCredential(data.oneroster_client_id_encrypted),
    clientSecret: decryptSisCredential(data.oneroster_client_secret_encrypted),
  };
}

/** Create a connection shell in `pending_dpa`, before any DPA or credentials. */
export async function createConnection(params: {
  districtId: string;
  sisType: SisType;
  actorId: string;
  baseUrl?: string;
  tokenUrl?: string;
}): Promise<SisConnectionSummary> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('district_sis_connections')
    .insert({
      district_id: params.districtId,
      sis_type: params.sisType,
      base_url: params.baseUrl ?? null,
      token_url: params.tokenUrl ?? null,
      status: 'pending_dpa',
      created_by: params.actorId,
    })
    .select(SUMMARY_COLUMNS)
    .single();

  if (error) throw new Error(`Failed to create SIS connection: ${error.message}`);

  const created = data as SisConnectionSummary;
  await logServerAuditEvent({
    user_id: params.actorId,
    action: 'sis_connection_created',
    resource_type: 'district_sis_connection',
    resource_id: created.id,
    metadata: { district_id: params.districtId, sis_type: params.sisType },
  });

  return created;
}

export interface StoreCredentialInput {
  connectionId: string;
  actorId: string;
  baseUrl?: string;
  tokenUrl?: string;
  /** Aeries */
  certificate?: string;
  /** OneRoster */
  clientId?: string;
  clientSecret?: string;
}

/**
 * Encrypt and store a district's credential on an existing connection.
 *
 * Deliberately NOT an upsert. The connection must already exist and its DPA
 * must already be recorded, because the database refuses a credential on a row
 * with a null `dpa_cleared_at` — an upsert would create the row and then be
 * rejected by that CHECK, surfacing the DPA gate as a constraint-violation
 * string instead of a clear "the DPA isn't signed yet". Order of operations is
 * createConnection -> setDpaCleared -> storeCredential.
 *
 * `sisType` comes from the stored row, never the caller: it decides which
 * column the secret lands in, and letting a request pick that is how an Aeries
 * certificate ends up in a OneRoster field.
 *
 * Fails closed if the encryption key is missing or malformed, BEFORE touching
 * the database, so a misconfigured environment cannot half-write a connection.
 */
export async function storeCredential(
  input: StoreCredentialInput
): Promise<SisConnectionSummary> {
  // The specific reason, not just "unconfigured": a missing key and a malformed
  // one need different fixes, and this message is what an operator reads first.
  const keyProblem = sisCredentialEncryptionProblem();
  if (keyProblem) {
    throw new Error(`${keyProblem} — refusing to store a credential`);
  }

  const supabase = createServiceClient();
  const { data: existing, error: loadError } = await supabase
    .from('district_sis_connections')
    .select('id, district_id, sis_type, dpa_cleared_at, credential_hint')
    .eq('id', input.connectionId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load SIS connection: ${loadError.message}`);
  }
  if (!existing) throw new Error(SIS_CONNECTION_NOT_FOUND);
  if (!existing.dpa_cleared_at) {
    throw new Error(
      'This district has no recorded DPA — credentials cannot be stored until one is on file'
    );
  }

  // A stored credential invalidates whatever the last test said. Leaving a
  // stale `connected` + `last_tested_at` in place would claim the credential
  // just pasted in is known-good, which is exactly backwards after a rotation.
  const patch: Record<string, unknown> = {
    status: 'testing',
    last_tested_at: null,
    last_test_result: null,
  };
  if (input.baseUrl !== undefined) patch.base_url = input.baseUrl;
  if (input.tokenUrl !== undefined) patch.token_url = input.tokenUrl;

  if (existing.sis_type === 'aeries') {
    if (!input.certificate) throw new Error('Aeries connection requires a certificate');
    patch.aeries_certificate_encrypted = encryptSisCredential(input.certificate);
    patch.credential_hint = credentialHint(input.certificate);
  } else {
    if (!input.clientId || !input.clientSecret) {
      throw new Error('OneRoster connection requires both a client id and a client secret');
    }
    patch.oneroster_client_id_encrypted = encryptSisCredential(input.clientId);
    patch.oneroster_client_secret_encrypted = encryptSisCredential(input.clientSecret);
    patch.credential_hint = credentialHint(input.clientSecret);
  }

  const { data, error } = await supabase
    .from('district_sis_connections')
    .update(patch)
    .eq('id', input.connectionId)
    .select(SUMMARY_COLUMNS)
    .single();

  if (error) {
    // The message can carry a constraint name but never a credential — the
    // patch values are ciphertext and PostgREST does not echo them here.
    log.error('Failed to store SIS credential', error, {
      connectionId: input.connectionId,
    });
    throw new Error(`Failed to store SIS credential: ${error.message}`);
  }

  // Rotation and first-time storage are materially different events during an
  // incident review, so they are logged as different actions.
  await logServerAuditEvent({
    user_id: input.actorId,
    action: existing.credential_hint ? 'sis_credential_rotated' : 'sis_credential_stored',
    resource_type: 'district_sis_connection',
    resource_id: input.connectionId,
    metadata: {
      district_id: existing.district_id,
      sis_type: existing.sis_type,
    },
  });

  return data as SisConnectionSummary;
}

/**
 * Record the outcome of a connection test. Never stores anything sensitive.
 *
 * NOTE for SPE-396/397, which will be the first real callers: `last_test_result`
 * is one of the columns granted to `authenticated`, so whatever lands here is
 * readable by the district's own staff. Assemble it from named fields (status,
 * area, message) — never spread a raw provider response into it. A failing SIS
 * call can echo the submitted credential back in its body, which is why
 * lib/integrations/aeries/client.ts already discards the body and keeps only
 * status and path.
 */
export async function recordTestResult(params: {
  connectionId: string;
  actorId: string;
  ok: boolean;
  result: SisTestResult;
}): Promise<void> {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from('district_sis_connections')
    .update({
      status: params.ok ? 'connected' : 'error',
      last_tested_at: new Date().toISOString(),
      last_test_result: params.result,
    })
    .eq('id', params.connectionId);

  if (error) throw new Error(`Failed to record test result: ${error.message}`);

  await logServerAuditEvent({
    user_id: params.actorId,
    action: 'sis_connection_tested',
    resource_type: 'district_sis_connection',
    resource_id: params.connectionId,
    metadata: { ok: params.ok },
  });
}

/**
 * Disconnect: clear the credentials, keep the connection row.
 *
 * The row is retained deliberately — it carries the DPA clearance and the
 * record of who connected what and when, which is exactly what someone asks
 * for after a disconnection. Deleting it would destroy that record to save a
 * row.
 */
export async function disconnect(params: {
  connectionId: string;
  actorId: string;
}): Promise<void> {
  const supabase = createServiceClient();
  // `.select().maybeSingle()` so a bogus id is a genuine failure. An UPDATE
  // matching no row returns no error, so without this a disconnect against a
  // connection that does not exist would report success AND write an
  // `sis_connection_disconnected` audit record for it — a false entry in the
  // one log someone reads during an incident. The other mutations check
  // existence up front; this was the only one that did not.
  const { data, error } = await supabase
    .from('district_sis_connections')
    .update({
      aeries_certificate_encrypted: null,
      oneroster_client_id_encrypted: null,
      oneroster_client_secret_encrypted: null,
      credential_hint: null,
      last_tested_at: null,
      last_test_result: null,
      status: 'disabled',
    })
    .eq('id', params.connectionId)
    .select('id')
    .maybeSingle();

  if (error) throw new Error(`Failed to disconnect: ${error.message}`);
  if (!data) throw new Error(SIS_CONNECTION_NOT_FOUND);

  await logServerAuditEvent({
    user_id: params.actorId,
    action: 'sis_connection_disconnected',
    resource_type: 'district_sis_connection',
    resource_id: params.connectionId,
  });
}

/**
 * Record or revoke a district's signed DPA. Speddy-staff only — the caller is
 * responsible for that check; this module does not know who is asking.
 *
 * Revoking is intentionally supported: a DPA can lapse. Because the CHECK
 * constraint refuses to leave credentials behind an un-cleared DPA, revoking
 * clears them in the same statement rather than leaving a live certificate
 * sitting behind a gate that has just closed.
 */
export async function setDpaCleared(params: {
  connectionId: string;
  actorId: string;
  cleared: boolean;
}): Promise<void> {
  const supabase = createServiceClient();

  const { data: existing, error: loadError } = await supabase
    .from('district_sis_connections')
    .select('id, status')
    .eq('id', params.connectionId)
    .maybeSingle();

  if (loadError) {
    throw new Error(`Failed to load SIS connection: ${loadError.message}`);
  }
  if (!existing) throw new Error(SIS_CONNECTION_NOT_FOUND);

  // Recording a DPA lifts the entry state and nothing else. A DPA renewal on a
  // live connection must not knock it back to `awaiting_credentials` — the
  // credentials are still there — and must not un-disable a disabled one.
  const patch: Record<string, unknown> = params.cleared
    ? {
        dpa_cleared_at: new Date().toISOString(),
        ...(existing.status === 'pending_dpa' ? { status: 'awaiting_credentials' } : {}),
      }
    : {
        dpa_cleared_at: null,
        aeries_certificate_encrypted: null,
        oneroster_client_id_encrypted: null,
        oneroster_client_secret_encrypted: null,
        credential_hint: null,
        last_tested_at: null,
        last_test_result: null,
        status: 'pending_dpa',
      };

  const { error } = await supabase
    .from('district_sis_connections')
    .update(patch)
    .eq('id', params.connectionId);

  if (error) throw new Error(`Failed to update DPA state: ${error.message}`);

  await logServerAuditEvent({
    user_id: params.actorId,
    action: params.cleared ? 'sis_dpa_cleared' : 'sis_dpa_revoked',
    resource_type: 'district_sis_connection',
    resource_id: params.connectionId,
  });
}
