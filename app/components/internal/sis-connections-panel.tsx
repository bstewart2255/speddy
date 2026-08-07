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

                  <button
                    type="button"
                    onClick={() => setDpa(connection, !dpaCleared)}
                    disabled={busy}
                    className={`px-4 py-2 text-sm rounded-md transition-colors disabled:opacity-50 ${
                      dpaCleared
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        : 'bg-purple-600 hover:bg-purple-700 text-white'
                    }`}
                  >
                    {busy ? 'Saving…' : dpaCleared ? 'Revoke DPA' : 'Record signed DPA'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
