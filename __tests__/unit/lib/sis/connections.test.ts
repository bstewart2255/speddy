/**
 * SPE-395 · lib/sis/connections — the credential store's app-layer gates.
 *
 * These tests deliberately do NOT claim anything about RLS or column grants:
 * the Supabase client is mocked, so a mocked write "succeeds" whether or not
 * the database would have permitted it. That half is covered by
 * `npm run sim:verify-sis-rls` against a real signed-in session.
 *
 * What IS testable here is everything the module decides before the database
 * sees it, and every one of these is a rule that only exists in this file:
 *   - a credential is never stored without a recorded DPA;
 *   - which column a secret lands in comes from the stored row, never the
 *     caller;
 *   - what reaches the database is ciphertext, and the hint is only a mask;
 *   - a stored credential invalidates the previous test result;
 *   - revoking a DPA takes the credentials with it.
 */
import { randomBytes } from 'crypto';

const CONNECTION_ID = '33333333-3333-4333-8333-333333333333';
const ACTOR_ID = '11111111-1111-4111-8111-111111111111';
const DISTRICT_ID = '0618990';

interface QueryRecord {
  table: string;
  op: 'select' | 'insert' | 'update';
  select?: string;
  values?: Record<string, unknown>;
  eq?: [string, unknown];
}

const results: Array<{ data: unknown; error: unknown }> = [];
const calls: QueryRecord[] = [];

function nextResult() {
  const result = results.shift();
  if (!result) throw new Error('mock supabase: no result queued for this query');
  return Promise.resolve(result);
}

function builder(record: QueryRecord): any {
  const chain: any = {
    select: (cols: string) => {
      record.select = cols;
      return chain;
    },
    insert: (values: Record<string, unknown>) => {
      record.op = 'insert';
      record.values = values;
      return chain;
    },
    update: (values: Record<string, unknown>) => {
      record.op = 'update';
      record.values = values;
      return chain;
    },
    eq: (col: string, val: unknown) => {
      record.eq = [col, val];
      return chain;
    },
    order: () => nextResult(),
    single: () => nextResult(),
    maybeSingle: () => nextResult(),
    // `.update().eq()` is awaited directly, with no terminal method.
    then: (resolve: any, reject: any) => nextResult().then(resolve, reject),
  };
  return chain;
}

jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      const record: QueryRecord = { table, op: 'select' };
      calls.push(record);
      return builder(record);
    },
  }),
}));

const mockAudit = jest.fn(async () => {});
jest.mock('@/lib/supabase/audit-log-server', () => ({
  logServerAuditEvent: (...args: unknown[]) => mockAudit(...(args as [])),
}));

jest.mock('@/lib/logger', () => ({
  logger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import {
  disconnect,
  getConnection,
  getDecryptedCredential,
  listConnections,
  recordTestResult,
  setDpaCleared,
  storeCredential,
} from '@/lib/sis/connections';
import { decryptSisCredential, encryptSisCredential } from '@/lib/sis/credential-crypto';

const CREDENTIAL_COLUMNS = [
  'aeries_certificate_encrypted',
  'oneroster_client_id_encrypted',
  'oneroster_client_secret_encrypted',
];

const summaryRow = (over: Record<string, unknown> = {}) => ({
  id: CONNECTION_ID,
  district_id: DISTRICT_ID,
  sis_type: 'aeries',
  base_url: null,
  token_url: null,
  credential_hint: null,
  status: 'testing',
  dpa_cleared_at: '2026-08-01T00:00:00.000Z',
  last_tested_at: null,
  last_test_result: null,
  created_by: ACTOR_ID,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  ...over,
});

describe('lib/sis/connections', () => {
  const originalKey = process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;

  beforeEach(() => {
    results.length = 0;
    calls.length = 0;
    mockAudit.mockClear();
    process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;
    else process.env.SIS_CREDENTIAL_ENCRYPTION_KEY = originalKey;
  });

  describe('reads never ask for a credential column', () => {
    it('listConnections selects only granted columns', async () => {
      results.push({ data: [summaryRow()], error: null });
      await listConnections(DISTRICT_ID);

      expect(calls[0].select).toBeDefined();
      for (const col of CREDENTIAL_COLUMNS) {
        expect(calls[0].select).not.toContain(col);
      }
      // `*` would expand to columns the browser grant excludes, and would also
      // pull ciphertext into server memory for a status read.
      expect(calls[0].select).not.toBe('*');
    });

    it('getConnection selects only granted columns', async () => {
      results.push({ data: summaryRow(), error: null });
      await getConnection(CONNECTION_ID);

      for (const col of CREDENTIAL_COLUMNS) {
        expect(calls[0].select).not.toContain(col);
      }
      // The `not.toBe('*')` guard matters MORE here than on listConnections:
      // getConnection's row is serialized straight to the browser by the DPA
      // route, so a `select('*')` would ship credential ciphertext into a staff
      // browser. Without this line the test passes on `'*'` — the string
      // contains none of the column names above. (Caught by mutation: switching
      // to `select('*')` left all 25 tests green.)
      expect(calls[0].select).not.toBe('*');
      expect(calls[0].select).toContain('credential_hint');
    });
  });

  describe('storeCredential — the DPA gate', () => {
    it('refuses when no DPA is recorded, without writing', async () => {
      results.push({ data: summaryRow({ dpa_cleared_at: null }), error: null });

      await expect(
        storeCredential({
          connectionId: CONNECTION_ID,
          actorId: ACTOR_ID,
          certificate: 'aeries-cert-value-1234',
        })
      ).rejects.toThrow(/no recorded DPA/i);

      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('refuses when the connection does not exist', async () => {
      results.push({ data: null, error: null });

      await expect(
        storeCredential({
          connectionId: CONNECTION_ID,
          actorId: ACTOR_ID,
          certificate: 'aeries-cert-value-1234',
        })
      ).rejects.toThrow('SIS connection not found');

      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    });

    it('refuses before touching the database when the key is unconfigured', async () => {
      delete process.env.SIS_CREDENTIAL_ENCRYPTION_KEY;

      await expect(
        storeCredential({
          connectionId: CONNECTION_ID,
          actorId: ACTOR_ID,
          certificate: 'aeries-cert-value-1234',
        })
      ).rejects.toThrow(/SIS_CREDENTIAL_ENCRYPTION_KEY is not configured/);

      // Not one query: a misconfigured environment must not leave a row in a
      // half-written state.
      expect(calls).toHaveLength(0);
    });
  });

  describe('storeCredential — what reaches the database', () => {
    it('writes ciphertext, never the plaintext secret', async () => {
      const CERT = 'aeries-certificate-supersecret-a9f2';
      results.push({ data: summaryRow(), error: null });
      results.push({ data: summaryRow({ credential_hint: '••••a9f2' }), error: null });

      await storeCredential({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        certificate: CERT,
      });

      const write = calls.find((c) => c.op === 'update')!;
      const stored = write.values!.aeries_certificate_encrypted as string;

      expect(stored).not.toContain(CERT);
      expect(stored).toMatch(/^v1\./);
      expect(decryptSisCredential(stored)).toBe(CERT);

      // The whole serialized patch must not carry the secret anywhere — a hint
      // built from the wrong slice would leak it right past the ciphertext check.
      expect(JSON.stringify(write.values)).not.toContain(CERT);
      expect(write.values!.credential_hint).toBe('••••a9f2');
    });

    it('invalidates the previous test result', async () => {
      // A rotation must not inherit "connected, tested last Tuesday" — that
      // would vouch for a credential that has never been tried.
      results.push({
        data: summaryRow({ status: 'connected', credential_hint: '••••0000' }),
        error: null,
      });
      results.push({ data: summaryRow(), error: null });

      await storeCredential({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        certificate: 'aeries-cert-value-1234',
      });

      const write = calls.find((c) => c.op === 'update')!;
      expect(write.values!.status).toBe('testing');
      expect(write.values!.last_tested_at).toBeNull();
      expect(write.values!.last_test_result).toBeNull();
    });

    it('takes sis_type from the stored row, not the caller', async () => {
      // The row is aeries. A caller sending OneRoster fields must be refused
      // rather than having them written into OneRoster columns on an Aeries row.
      results.push({ data: summaryRow({ sis_type: 'aeries' }), error: null });

      await expect(
        storeCredential({
          connectionId: CONNECTION_ID,
          actorId: ACTOR_ID,
          clientId: 'client-id',
          clientSecret: 'client-secret',
        })
      ).rejects.toThrow(/requires a certificate/i);

      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    });

    it('requires both halves of a OneRoster pair', async () => {
      results.push({ data: summaryRow({ sis_type: 'oneroster' }), error: null });

      await expect(
        storeCredential({
          connectionId: CONNECTION_ID,
          actorId: ACTOR_ID,
          clientId: 'client-id-only',
        })
      ).rejects.toThrow(/client id and a client secret/i);

      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
    });

    it('hints from the OneRoster secret, and encrypts both halves', async () => {
      const ID = 'oneroster-client-id-aaaa';
      const SECRET = 'oneroster-client-secret-bbbb';
      results.push({ data: summaryRow({ sis_type: 'oneroster' }), error: null });
      results.push({ data: summaryRow({ sis_type: 'oneroster' }), error: null });

      await storeCredential({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        clientId: ID,
        clientSecret: SECRET,
      });

      const write = calls.find((c) => c.op === 'update')!;
      expect(decryptSisCredential(write.values!.oneroster_client_id_encrypted as string)).toBe(ID);
      expect(
        decryptSisCredential(write.values!.oneroster_client_secret_encrypted as string)
      ).toBe(SECRET);
      expect(write.values!.credential_hint).toBe('••••bbbb');
      expect(JSON.stringify(write.values)).not.toContain(SECRET);
    });
  });

  describe('storeCredential — audit trail', () => {
    it('logs a first-time store as stored', async () => {
      results.push({ data: summaryRow({ credential_hint: null }), error: null });
      results.push({ data: summaryRow(), error: null });

      await storeCredential({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        certificate: 'aeries-cert-value-1234',
      });

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sis_credential_stored', user_id: ACTOR_ID })
      );
    });

    it('logs a replacement as rotated', async () => {
      results.push({ data: summaryRow({ credential_hint: '••••0000' }), error: null });
      results.push({ data: summaryRow(), error: null });

      await storeCredential({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        certificate: 'aeries-cert-value-1234',
      });

      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sis_credential_rotated' })
      );
    });

    it('never puts a credential in the audit metadata', async () => {
      const CERT = 'aeries-certificate-supersecret-a9f2';
      results.push({ data: summaryRow(), error: null });
      results.push({ data: summaryRow(), error: null });

      await storeCredential({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        certificate: CERT,
      });

      expect(JSON.stringify(mockAudit.mock.calls)).not.toContain(CERT);
    });
  });

  describe('setDpaCleared', () => {
    it('revoking takes the credentials and the test result with it', async () => {
      results.push({ data: { id: CONNECTION_ID, status: 'connected' }, error: null });
      results.push({ data: null, error: null });

      await setDpaCleared({ connectionId: CONNECTION_ID, actorId: ACTOR_ID, cleared: false });

      const write = calls.find((c) => c.op === 'update')!;
      expect(write.values!.dpa_cleared_at).toBeNull();
      for (const col of CREDENTIAL_COLUMNS) {
        expect(write.values![col]).toBeNull();
      }
      expect(write.values!.credential_hint).toBeNull();
      expect(write.values!.last_tested_at).toBeNull();
      expect(write.values!.status).toBe('pending_dpa');
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sis_dpa_revoked' })
      );
    });

    it('recording a DPA lifts a pending_dpa row to awaiting_credentials', async () => {
      results.push({ data: { id: CONNECTION_ID, status: 'pending_dpa' }, error: null });
      results.push({ data: null, error: null });

      await setDpaCleared({ connectionId: CONNECTION_ID, actorId: ACTOR_ID, cleared: true });

      const write = calls.find((c) => c.op === 'update')!;
      expect(write.values!.dpa_cleared_at).toEqual(expect.any(String));
      expect(write.values!.status).toBe('awaiting_credentials');
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sis_dpa_cleared' })
      );
    });

    it('renewing a DPA on a live connection leaves its status alone', async () => {
      // Otherwise a routine annual renewal would report a working integration
      // as "waiting on credentials" that are, in fact, already stored.
      results.push({ data: { id: CONNECTION_ID, status: 'connected' }, error: null });
      results.push({ data: null, error: null });

      await setDpaCleared({ connectionId: CONNECTION_ID, actorId: ACTOR_ID, cleared: true });

      const write = calls.find((c) => c.op === 'update')!;
      expect(write.values!.dpa_cleared_at).toEqual(expect.any(String));
      expect(write.values).not.toHaveProperty('status');
    });

    it('refuses an unknown connection', async () => {
      results.push({ data: null, error: null });

      await expect(
        setDpaCleared({ connectionId: CONNECTION_ID, actorId: ACTOR_ID, cleared: true })
      ).rejects.toThrow('SIS connection not found');

      expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
      expect(mockAudit).not.toHaveBeenCalled();
    });
  });

  describe('getDecryptedCredential', () => {
    it('returns the decrypted certificate for a populated aeries row', async () => {
      const CERT = 'sim395fakecert0000000000000da9f2';
      results.push({
        data: { sis_type: 'aeries', aeries_certificate_encrypted: encryptSisCredential(CERT) },
        error: null,
      });

      await expect(getDecryptedCredential(CONNECTION_ID)).resolves.toEqual({
        sisType: 'aeries',
        certificate: CERT,
      });
    });

    it('returns null when the connection holds no credential yet', async () => {
      // pending_dpa / awaiting_credentials is an ordinary state, not an error —
      // callers must not have to distinguish "absent" from "failed".
      results.push({
        data: { sis_type: 'aeries', aeries_certificate_encrypted: null },
        error: null,
      });

      await expect(getDecryptedCredential(CONNECTION_ID)).resolves.toBeNull();
    });

    it('returns null for a half-populated OneRoster pair rather than a partial credential', async () => {
      results.push({
        data: {
          sis_type: 'oneroster',
          oneroster_client_id_encrypted: encryptSisCredential('client-id'),
          oneroster_client_secret_encrypted: null,
        },
        error: null,
      });

      await expect(getDecryptedCredential(CONNECTION_ID)).resolves.toBeNull();
    });

    it('returns null when the connection does not exist', async () => {
      results.push({ data: null, error: null });
      await expect(getDecryptedCredential(CONNECTION_ID)).resolves.toBeNull();
    });
  });

  describe('disconnect', () => {
    it('refuses an unknown id instead of auditing a no-op', async () => {
      // An UPDATE matching no row returns no error, so without a row check this
      // would report success and write a disconnect audit record for a
      // connection that never existed.
      results.push({ data: null, error: null });

      await expect(
        disconnect({ connectionId: CONNECTION_ID, actorId: ACTOR_ID })
      ).rejects.toThrow('SIS connection not found');

      expect(mockAudit).not.toHaveBeenCalled();
    });

    it('clears credentials and the stale test result, keeping the row', async () => {
      results.push({ data: { id: CONNECTION_ID }, error: null });

      await disconnect({ connectionId: CONNECTION_ID, actorId: ACTOR_ID });

      const write = calls.find((c) => c.op === 'update')!;
      for (const col of CREDENTIAL_COLUMNS) {
        expect(write.values![col]).toBeNull();
      }
      expect(write.values!.credential_hint).toBeNull();
      expect(write.values!.last_tested_at).toBeNull();
      expect(write.values!.status).toBe('disabled');
      // The DPA clearance and the provenance survive — that record is the
      // reason the row is kept rather than deleted.
      expect(write.values).not.toHaveProperty('dpa_cleared_at');
      expect(write.values).not.toHaveProperty('created_by');
    });
  });

  describe('recordTestResult', () => {
    it('marks a failing test as error and audits the outcome', async () => {
      results.push({ data: null, error: null });

      await recordTestResult({
        connectionId: CONNECTION_ID,
        actorId: ACTOR_ID,
        ok: false,
        result: { message: 'HTTP 401' },
      });

      const write = calls.find((c) => c.op === 'update')!;
      expect(write.values!.status).toBe('error');
      expect(write.values!.last_tested_at).toEqual(expect.any(String));
      expect(mockAudit).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'sis_connection_tested', metadata: { ok: false } })
      );
    });

    it('surfaces a write failure rather than reporting success', async () => {
      results.push({ data: null, error: { message: 'permission denied' } });

      await expect(
        recordTestResult({ connectionId: CONNECTION_ID, actorId: ACTOR_ID, ok: true, result: {} })
      ).rejects.toThrow(/permission denied/);

      expect(mockAudit).not.toHaveBeenCalled();
    });
  });
});
