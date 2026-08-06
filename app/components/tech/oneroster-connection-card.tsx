'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';
import type { OneRosterStepResult, OneRosterTestReport } from '@/lib/sis/oneroster-setup';
import type { ConnectionSummary } from './aeries-connection-card';

/**
 * OneRoster credential entry and the step-by-step test result (SPE-397).
 *
 * Four fields rather than two, and the pairing is the part districts get wrong:
 * the token address goes with the OneRoster address, and the Consumer ID goes
 * with the Secret Key. The Secret is the only masked field — the Consumer ID is
 * an identifier, not a secret, and masking it would just make it harder to check
 * a paste against the Aeries screen.
 *
 * Like the Aeries card, the Secret is write-only: once stored, all this screen
 * can say is the last four characters, because that is all the server will ever
 * return (SPE-395's column grants).
 */

const STEP_STYLES: Record<OneRosterStepResult['status'], string> = {
  ok: 'border-emerald-200 bg-emerald-50',
  denied: 'border-amber-200 bg-amber-50',
  error: 'border-red-200 bg-red-50',
  untested: 'border-gray-200 bg-gray-50',
};

const STEP_MARK: Record<OneRosterStepResult['status'], string> = {
  ok: 'text-emerald-600',
  denied: 'text-amber-600',
  error: 'text-red-600',
  untested: 'text-gray-400',
};

const STEP_GLYPH: Record<OneRosterStepResult['status'], string> = {
  ok: '✓',
  denied: '!',
  error: '!',
  untested: '–',
};

function StepRow({ step }: { step: OneRosterStepResult }) {
  return (
    <li className={`rounded-md border p-3 ${STEP_STYLES[step.status]}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-sm font-bold ${STEP_MARK[step.status]}`}>
          {STEP_GLYPH[step.status]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{step.label}</p>
          <p className="mt-0.5 text-sm text-gray-700">{step.message}</p>
        </div>
      </div>
    </li>
  );
}

export default function OneRosterConnectionCard({
  connection,
  onChanged,
}: {
  connection: ConnectionSummary;
  onChanged: () => void | Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(connection.base_url ?? '');
  const [tokenUrl, setTokenUrl] = useState(connection.token_url ?? '');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<OneRosterTestReport | null>(null);

  const hasCredential = Boolean(connection.credential_hint);
  const canSave =
    baseUrl.trim() && tokenUrl.trim() && clientId.trim() && clientSecret.trim();

  const save = async () => {
    // setSaving(true) does not disable the button until the next render, so a
    // double click inside one tick starts two writes. Each test run reaches the
    // district's own SIS and writes an audit row.
    if (saving) return;
    setSaving(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/tech/sis/oneroster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, tokenUrl, clientId, clientSecret }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save the credentials.');
      // Clear both from component state the moment they are stored. They are
      // already unrecoverable from the server; there is no reason to keep the
      // plaintext sitting in the page.
      setClientId('');
      setClientSecret('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the credentials.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    if (testing) return;
    setTesting(true);
    setError(null);
    try {
      const res = await fetch('/api/tech/sis/oneroster/test', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not test the connection.');
      setReport(json.report as OneRosterTestReport);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not test the connection.');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {hasCredential ? 'Your OneRoster connection' : 'Enter your OneRoster details'}
        </CardTitle>
      </CardHeader>
      <CardBody>
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label htmlFor="oneroster-url" className="block text-sm font-medium text-gray-900">
              Your OneRoster address
            </label>
            <input
              id="oneroster-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourdistrictapi.aeries.net/admin"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Note this is usually a different address from the one you sign in to Aeries with —
              it often has <span className="font-mono">api</span> in it.
            </p>
          </div>

          <div>
            <label htmlFor="oneroster-token-url" className="block text-sm font-medium text-gray-900">
              Your token address
            </label>
            <input
              id="oneroster-token-url"
              type="text"
              value={tokenUrl}
              onChange={(e) => setTokenUrl(e.target.value)}
              placeholder="https://yourdistrictapi.aeries.net/admin/token/"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Usually the same address as above with <span className="font-mono">/token/</span> on
              the end.
            </p>
          </div>

          <div>
            <label htmlFor="oneroster-client-id" className="block text-sm font-medium text-gray-900">
              Consumer ID
            </label>
            <input
              id="oneroster-client-id"
              // Not masked: this is an identifier, not a secret, and hiding it
              // only makes it harder to check a paste against the Aeries screen.
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={hasCredential ? 'Enter both again to replace the saved pair' : ''}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label
              htmlFor="oneroster-client-secret"
              className="block text-sm font-medium text-gray-900"
            >
              Consumer Secret Key
            </label>
            <input
              id="oneroster-client-secret"
              // `password` so it is masked, excluded from autofill, and not read
              // aloud by screen readers in the clear.
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {hasCredential ? (
              <p className="mt-1 text-xs text-gray-500">
                A secret key ending{' '}
                <span className="font-mono">{connection.credential_hint?.slice(-4)}</span> is
                saved. It can&apos;t be shown again — leave these blank unless you&apos;re
                replacing them.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                Both come from{' '}
                <span className="font-medium">Display Consumer ID &amp; Secret Keys</span> in
                Aeries — <span className="font-medium">not</span> the certificate. The secret is
                stored encrypted and never shown again.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving || !canSave}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : hasCredential ? 'Replace credentials' : 'Save and continue'}
          </button>

          {hasCredential && (
            <button
              type="button"
              onClick={test}
              disabled={testing}
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? 'Checking…' : 'Test connection'}
            </button>
          )}

          {connection.last_tested_at && !report && (
            <span className="text-xs text-gray-500">
              Last checked {new Date(connection.last_tested_at).toLocaleString()}
            </span>
          )}
        </div>

        {report && (
          <div role="status" aria-live="polite" className="mt-6 border-t border-gray-200 pt-5">
            <p
              className={`text-sm font-medium ${report.ok ? 'text-emerald-700' : 'text-amber-700'}`}
            >
              {report.summary}
            </p>
            <ul className="mt-3 space-y-2">
              {report.steps.map((s) => (
                <StepRow key={s.key} step={s} />
              ))}
            </ul>
            {!report.ok && (
              <p className="mt-4 text-xs text-gray-600">
                Fix the steps above, then run the test again. Nothing needs to be re-entered here
                unless you&apos;re changing a credential.
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
