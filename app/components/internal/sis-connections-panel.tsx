'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The key-health payload is imported, never re-declared: a hand-copy of the
 * union would let the two sides drift with nothing failing the build, and the
 * drift renders as a red verdict on a healthy key. `import type` is erased at
 * compile time, so no server-only crypto reaches the bundle — the same thing
 * app/components/tech/aeries-connection-card.tsx does with AeriesTestReport.
 */
import type { SisKeySelfTest } from '@/lib/sis/credential-crypto';

import TeacherSyncCard from './teacher-sync-card';

/**
 * The verdict plus which build produced it. Extends the shared union rather
 * than restating it, so the ok/problem contract still has exactly one owner.
 */
type KeyHealthResponse = SisKeySelfTest & {
  deployment?: { commit: string; environment: string; checkedAt: string };
};

/**
 * Validates the whole discriminated union, not just `ok`. A body of
 * `{ ok: false }` with no reason would otherwise pass and render the strongest
 * claim on the page above an empty line — a verdict with nothing behind it.
 */
function isKeyHealthResponse(value: unknown): value is KeyHealthResponse {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { ok?: unknown; problem?: unknown };
  return body.ok === true || (body.ok === false && typeof body.problem === 'string');
}

/**
 * Speddy-staff control for a district's SIS connections (SPE-395).
 *
 * Its one job is the DPA switch. Credentials are never entered, shown, or
 * touched here — the district's own tech admin does that in the tech portal
 * (SPE-396/397). All this page can say about a credential is whether one exists
 * and its last four characters.
 */

type SisType = 'aeries' | 'oneroster';

interface SisConnection {
  id: string;
  district_id: string;
  sis_type: SisType;
  base_url: string | null;
  token_url: string | null;
  credential_hint: string | null;
  status: string;
  dpa_cleared_at: string | null;
  last_tested_at: string | null;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending_dpa: 'Waiting on DPA',
  awaiting_credentials: 'Waiting on district credentials',
  testing: 'Saved, not yet tested',
  connected: 'Connected',
  error: 'Last test failed',
  disabled: 'Disconnected',
};

const STATUS_STYLES: Record<string, string> = {
  pending_dpa: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  awaiting_credentials: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  testing: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  connected: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  error: 'bg-red-500/10 text-red-300 border-red-500/30',
  disabled: 'bg-slate-600/10 text-slate-400 border-slate-600/30',
};

const SIS_LABELS: Record<SisType, string> = {
  aeries: 'Aeries',
  oneroster: 'OneRoster',
};

/**
 * One probed area or step, as the internal test route flattens them (SPE-427).
 *
 * Aeries reports `areas` and OneRoster reports `steps`; the route normalizes
 * both to this, so there is one renderer here rather than two that could drift.
 */
interface StaffCheck {
  key: string;
  label: string;
  status: 'ok' | 'denied' | 'error' | 'untested';
  message: string;
  count?: number;
}

interface StaffTestResult {
  sisType: SisType;
  ok: boolean;
  summary: string;
  checks: StaffCheck[];
  /** Present only when resolution had to move off the stored address. */
  usedAddress?: string;
  /** The address on file that `usedAddress` differs from, if there was one. */
  storedAddress?: string | null;
}

/**
 * Validated rather than asserted, for the same reason the key-health payload is:
 * an off-shape 200 would otherwise render a verdict with nothing behind it.
 */
function isStaffTestResult(value: unknown): value is StaffTestResult {
  if (typeof value !== 'object' || value === null) return false;
  const body = value as { ok?: unknown; summary?: unknown; checks?: unknown };
  return (
    typeof body.ok === 'boolean' &&
    typeof body.summary === 'string' &&
    Array.isArray(body.checks)
  );
}

const CHECK_STYLES: Record<StaffCheck['status'], string> = {
  ok: 'text-emerald-300',
  denied: 'text-amber-300',
  error: 'text-red-300',
  untested: 'text-slate-400',
};

const CHECK_MARKS: Record<StaffCheck['status'], string> = {
  ok: '✓',
  denied: '!',
  error: '✕',
  untested: '·',
};


function formatDate(value: string | null): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function SisConnectionsPanel({ districtId }: { districtId: string }) {
  const [connections, setConnections] = useState<SisConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState<SisType | null>(null);
  // Deliberately not loaded on mount: this reports on the deployment, not on
  // the district being viewed, and a green badge nobody asked for is the kind
  // of thing that goes stale on screen and gets believed anyway.
  const [keyHealth, setKeyHealth] = useState<KeyHealthResponse | null>(null);
  const [checkingKey, setCheckingKey] = useState(false);
  // Keyed by connection id so two connections' results cannot be confused for
  // one another — the whole point is telling Aeries and OneRoster apart.
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, StaffTestResult>>({});

  const checkKey = async () => {
    setCheckingKey(true);
    setKeyHealth(null);
    setError(null);
    // Bounded: without this a wedged deployment leaves the button disabled with
    // no way to retry — at exactly the moment an operator needs to re-run the
    // check after changing an env var.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 15_000);
    try {
      const res = await fetch('/api/internal/sis-key-health', {
        cache: 'no-store',
        signal: abort.signal,
      });

      // Status BEFORE parsing, and a failure to reach the check goes to the
      // page's `error` banner — never to `keyHealth`. A 401, a 5xx or an HTML
      // gateway page means the self-test never ran, and rendering that as
      // "districts cannot save SIS credentials" would state the strongest
      // possible claim about a key nobody asked about. The route returns 200
      // even when the key IS broken precisely so these stay distinguishable;
      // collapsing them here would undo that at the one moment it matters.
      if (!res.ok) {
        setError(`Could not run the encryption check (HTTP ${res.status}). The key was not tested.`);
        return;
      }

      const json: unknown = await res.json().catch(() => null);
      // The body is the whole answer, so it is validated rather than asserted:
      // an off-shape 200 would otherwise render the red verdict with a blank
      // reason, which reads as a diagnosis and is not one.
      if (!isKeyHealthResponse(json)) {
        setError('The encryption check returned an unreadable response. The key was not tested.');
        return;
      }
      setKeyHealth(json);
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      setError(
        timedOut
          ? 'The encryption check timed out. The key was not tested.'
          : 'Could not reach the encryption check. The key was not tested.',
      );
    } finally {
      clearTimeout(timer);
      setCheckingKey(false);
    }
  };

  /**
   * Run the district's own connection test from here (SPE-427).
   *
   * Reaches the district's SIS with their stored credential, which is why it is
   * a deliberate click rather than something that happens on load. It is the
   * same test their tech admin runs, so a green result here means what a green
   * result means to them.
   */
  const runTest = async (connection: SisConnection) => {
    setTesting(connection.id);
    setError(null);
    setTestResults((prev) => {
      // Drop the previous verdict before running. Leaving it on screen while a
      // new run is in flight shows a stale answer next to a spinner, and a
      // stale green is the one nobody re-reads.
      const next = { ...prev };
      delete next[connection.id];
      return next;
    });

    // Bounded, but ABOVE the server's own worst case, not below it. The Aeries
    // test can make two resolution attempts plus three area probes at a 30s
    // client timeout each — around 150s against a district whose server hangs.
    // A shorter deadline here would report "nothing was tested" while the
    // server went on to complete the report and write status/last_tested_at,
    // and would invite a re-click that fans out more traffic at a school
    // district's production server.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 180_000);
    try {
      const res = await fetch(`/api/internal/sis-connections/${connection.id}/test`, {
        method: 'POST',
        cache: 'no-store',
        signal: abort.signal,
      });
      const json: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message =
          typeof (json as { error?: unknown })?.error === 'string'
            ? (json as { error: string }).error
            : `The test could not be run (HTTP ${res.status}).`;
        setError(message);
        return;
      }
      if (!isStaffTestResult(json)) {
        setError('The test returned an unreadable response. Nothing was tested.');
        return;
      }
      setTestResults((prev) => ({ ...prev, [connection.id]: json }));
      // The run writes last_tested_at and status, so the row above it is now
      // stale — refresh rather than leave the chip disagreeing with the result
      // printed directly beneath it.
      await load();
    } catch (err) {
      const timedOut = err instanceof DOMException && err.name === 'AbortError';
      if (timedOut) {
        // Deliberately NOT "nothing was tested": we stopped waiting, the server
        // did not stop working. It may yet finish and record a result, so say
        // that and re-read the row rather than assert something we cannot know.
        setError(
          'Gave up waiting for the district\u2019s SIS. The test may still be running — reload in a moment before trying again.',
        );
        await load().catch(() => {});
      } else {
        setError('Could not reach the test. Nothing was tested.');
      }
    } finally {
      clearTimeout(timer);
      setTesting(null);
    }
  };

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/internal/sis-connections?districtId=${encodeURIComponent(districtId)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load SIS connections');
      setConnections(json.connections || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load SIS connections');
    } finally {
      setLoading(false);
    }
  }, [districtId]);

  useEffect(() => {
    load();
  }, [load]);

  const createConnection = async (sisType: SisType) => {
    setCreating(sisType);
    setError(null);
    try {
      const res = await fetch('/api/internal/sis-connections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ districtId, sisType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create connection');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create connection');
    } finally {
      setCreating(null);
    }
  };

  const setDpa = async (connection: SisConnection, cleared: boolean) => {
    // Revoking destroys the stored credential, so it is confirmed rather than
    // being one misplaced click away from cutting a district's integration.
    if (!cleared) {
      const confirmed = window.confirm(
        `Revoke the DPA for ${SIS_LABELS[connection.sis_type]}?\n\n` +
          'This deletes the stored credentials. The district will have to re-enter them ' +
          'after a new DPA is recorded.'
      );
      if (!confirmed) return;
    }

    setBusyId(connection.id);
    setError(null);
    // Revoking wipes the credential and hides the test button, so a verdict left
    // on screen would sit under a row reading "Disconnected / None stored" — the
    // same stale-green hazard runTest guards against before a re-run, one
    // control over.
    setTestResults((prev) => {
      const next = { ...prev };
      delete next[connection.id];
      return next;
    });
    try {
      const res = await fetch(`/api/internal/sis-connections/${connection.id}/dpa`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cleared }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update the DPA');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update the DPA');
    } finally {
      setBusyId(null);
    }
  };

  const existingTypes = new Set(connections.map((c) => c.sis_type));
  const addableTypes = (['aeries', 'oneroster'] as SisType[]).filter(
    (t) => !existingTypes.has(t)
  );

  return (
    <div className="bg-slate-800 rounded-lg border border-slate-700 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-white">SIS Connections</h2>
          <p className="mt-1 text-sm text-slate-400">
            Record the signed data privacy agreement here. Until it is recorded, the
            district cannot enter SIS credentials.
          </p>
        </div>
        {addableTypes.length > 0 && (
          <div className="flex gap-2">
            {addableTypes.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => createConnection(type)}
                disabled={creating !== null}
                className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-md transition-colors"
              >
                {creating === type ? 'Adding…' : `Add ${SIS_LABELS[type]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300"
        >
          {error}
        </div>
      )}

      {/* Encryption-key check. Sits apart from the connection list on purpose:
          it says nothing about this district, only about whether the running
          deployment can encrypt at all. */}
      <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-white">Credential encryption</p>
            <p className="mt-0.5 text-xs text-slate-400">
              Checks whether this deployment can encrypt SIS credentials. No district
              data is read and nothing is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={checkKey}
            disabled={checkingKey}
            className="px-3 py-2 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-md transition-colors"
          >
            {checkingKey ? 'Checking…' : 'Check encryption key'}
          </button>
        </div>

        {/* The live region is mounted unconditionally and only its CONTENT is
            conditional: a region inserted in the same commit as its text is the
            classic aria-live pitfall where nothing is announced at all. */}
        <div role="status" aria-live="polite" className="contents">
          {keyHealth && (
            <div
              className={`mt-3 rounded-md border px-3 py-2 text-sm ${
                keyHealth.ok
                  ? STATUS_STYLES.connected
                  : STATUS_STYLES.error
              }`}
            >
              {keyHealth.ok ? (
                'Working — this deployment can encrypt SIS credentials, so a district with a recorded DPA can save them.'
              ) : (
                <>
                  <span className="font-medium">
                    Not working — districts cannot save SIS credentials.
                  </span>
                  <span className="mt-1 block text-red-200/80">{keyHealth.problem}</span>
                </>
              )}
              {keyHealth.deployment && (
                // Which build answered. Without it a green from a preview URL
                // is indistinguishable from a green from the build serving
                // districts — the same "which deployment?" ambiguity one level
                // down from the one this check exists to settle.
                <span className="mt-2 block text-xs opacity-70">
                  {keyHealth.deployment.environment} · {keyHealth.deployment.commit} ·{' '}
                  {new Date(keyHealth.deployment.checkedAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">Loading…</p>
      ) : connections.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          No SIS connection set up for this district yet.
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {connections.map((connection) => {
            const dpaCleared = Boolean(connection.dpa_cleared_at);
            const busy = busyId === connection.id;
            const result = testResults[connection.id];
            return (
              <li
                key={connection.id}
                className="rounded-lg border border-slate-700 bg-slate-800/50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-white">
                        {SIS_LABELS[connection.sis_type]}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          STATUS_STYLES[connection.status] ||
                          'bg-slate-500/10 text-slate-300 border-slate-500/30'
                        }`}
                      >
                        {STATUS_LABELS[connection.status] || connection.status}
                      </span>
                    </div>
                    <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-400">
                      <div className="flex gap-2">
                        <dt>DPA:</dt>
                        <dd className="text-slate-300">
                          {dpaCleared ? formatDate(connection.dpa_cleared_at) : 'Not recorded'}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt>Credential:</dt>
                        <dd className="font-mono text-slate-300">
                          {connection.credential_hint || 'None stored'}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt>Last tested:</dt>
                        <dd className="text-slate-300">
                          {formatDate(connection.last_tested_at)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="flex gap-2">
                    {/* Only offered when there is something to test. Without a
                        credential the route returns 409, and a button whose only
                        outcome is an error message is worse than no button. */}
                    {connection.credential_hint && (
                      <button
                        type="button"
                        onClick={() => runTest(connection)}
                        disabled={testing !== null}
                        className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white rounded-md transition-colors"
                      >
                        {testing === connection.id ? 'Testing…' : 'Run connection test'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDpa(connection, !dpaCleared)}
                      // Also disabled while THIS connection is being tested.
                      // The server refuses to record a result over a revocation
                      // either way, but a test can run for minutes, and letting
                      // someone revoke mid-run means watching a spinner resolve
                      // into a report about a connection they just cut.
                      disabled={busy || testing === connection.id}
                      className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 ${
                        dpaCleared
                          ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      {busy ? 'Saving…' : dpaCleared ? 'Revoke DPA' : 'Record signed DPA'}
                    </button>
                  </div>
                </div>

                {/* Mounted unconditionally with only its CONTENT conditional —
                    a live region inserted in the same commit as its text is the
                    classic aria-live pitfall where nothing is announced. */}
                <div role="status" aria-live="polite" className="contents">
                  {result && (
                    <div className="mt-4 rounded-md border border-slate-700 bg-slate-900/40 px-4 py-3">
                      <p
                        className={`text-sm font-medium ${
                          result.ok ? 'text-emerald-300' : 'text-amber-200'
                        }`}
                      >
                        {result.summary}
                      </p>

                      {result.usedAddress && (
                        // The answer SPE-426 could not get without asking the
                        // district: which address actually responded.
                        //
                        // Two different facts, worded differently on purpose. A
                        // OneRoster token address is normally blank, so a single
                        // "not the address on file" line would fire on every
                        // healthy test and stop meaning anything.
                        <p className="mt-1 break-all text-xs text-slate-400">
                          {result.storedAddress ? (
                            <>
                              Answered at{' '}
                              <span className="font-mono">{result.usedAddress}</span> — not{' '}
                              <span className="font-mono">{result.storedAddress}</span>, the address
                              on file.
                            </>
                          ) : (
                            <>
                              No address was on file, so we worked one out:{' '}
                              <span className="font-mono">{result.usedAddress}</span>.
                            </>
                          )}
                        </p>
                      )}

                      <ul className="mt-3 space-y-1">
                        {result.checks.map((check) => (
                          <li key={check.key} className="flex gap-2 text-sm">
                            <span
                              aria-hidden="true"
                              className={`w-3 shrink-0 ${CHECK_STYLES[check.status]}`}
                            >
                              {CHECK_MARKS[check.status]}
                            </span>
                            <span className="text-slate-300">
                              <span className={`font-medium ${CHECK_STYLES[check.status]}`}>
                                {check.label}
                              </span>
                              {' — '}
                              {check.message}
                              {/* Aeries' school count is a real total. Every
                                  other count in either report is capped at one
                                  row on purpose — including OneRoster's Schools
                                  step, which uses limit: 1 — so printing them
                                  would render a district sharing 40 schools as
                                  "(1 schools)". */}
                              {result.sisType === 'aeries' &&
                                check.key === 'schools' &&
                                typeof check.count === 'number' && (
                                  <span className="text-slate-400"> ({check.count} schools)</span>
                                )}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* SPE-437: the concierge teacher sync. Only where it can run —
                    an OneRoster connection with a recorded DPA and a stored
                    credential; anything else would be a button whose only
                    outcome is a 409. */}
                {connection.sis_type === 'oneroster' &&
                  dpaCleared &&
                  connection.credential_hint && (
                    <TeacherSyncCard connectionId={connection.id} />
                  )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
