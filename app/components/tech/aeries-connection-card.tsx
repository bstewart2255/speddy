'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';
import type { AeriesAreaResult, AeriesTestReport } from '@/lib/sis/aeries-setup';

/**
 * Credential entry and the per-area test result (SPE-396).
 *
 * The certificate field is write-only by design: once stored, all this screen
 * can say about it is the last four characters, because that is all the server
 * will ever return (SPE-395's column grants). Replacing it means typing a new
 * one — there is no "reveal", and there is nothing to reveal.
 */

export interface ConnectionSummary {
  id: string;
  sis_type: string;
  base_url: string | null;
  credential_hint: string | null;
  status: string;
  dpa_cleared_at: string | null;
  last_tested_at: string | null;
}

// 'untested' is deliberately neutral. Those areas were never probed, and
// colouring them red would send a district off to fix checkboxes that may well
// already be correct.
const AREA_STYLES: Record<AeriesAreaResult['status'], string> = {
  ok: 'border-emerald-200 bg-emerald-50',
  denied: 'border-amber-200 bg-amber-50',
  error: 'border-red-200 bg-red-50',
  untested: 'border-gray-200 bg-gray-50',
};

const AREA_MARK: Record<AeriesAreaResult['status'], string> = {
  ok: 'text-emerald-600',
  denied: 'text-amber-600',
  error: 'text-red-600',
  untested: 'text-gray-400',
};

const AREA_GLYPH: Record<AeriesAreaResult['status'], string> = {
  ok: '\u2713',
  denied: '!',
  error: '!',
  untested: '\u2013',
};

function AreaRow({ area }: { area: AeriesAreaResult }) {
  return (
    <li className={`rounded-md border p-3 ${AREA_STYLES[area.status]}`}>
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 text-sm font-bold ${AREA_MARK[area.status]}`}>
          {AREA_GLYPH[area.status]}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">{area.label}</p>
          <p className="mt-0.5 text-sm text-gray-700">{area.message}</p>
        </div>
      </div>
    </li>
  );
}

export default function AeriesConnectionCard({
  connection,
  onChanged,
}: {
  connection: ConnectionSummary;
  onChanged: () => void | Promise<void>;
}) {
  const [baseUrl, setBaseUrl] = useState(connection.base_url ?? '');
  const [certificate, setCertificate] = useState('');
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AeriesTestReport | null>(null);

  const hasCredential = Boolean(connection.credential_hint);

  const save = async () => {
    setSaving(true);
    setError(null);
    setReport(null);
    try {
      const res = await fetch('/api/tech/sis/aeries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl, certificate }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save the credential.');
      // Clear it from component state the moment it is stored. It is already
      // unrecoverable from the server; there is no reason to keep the plaintext
      // sitting in the page.
      setCertificate('');
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the credential.');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    try {
      const res = await fetch('/api/tech/sis/aeries/test', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not test the connection.');
      setReport(json.report as AeriesTestReport);
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
        <CardTitle>{hasCredential ? 'Your Aeries connection' : 'Enter your Aeries details'}</CardTitle>
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
            <label htmlFor="aeries-url" className="block text-sm font-medium text-gray-900">
              Your Aeries web address
            </label>
            <input
              id="aeries-url"
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://yourdistrict.aeries.net"
              autoComplete="off"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Paste the address you use to sign in to Aeries. We&apos;ll sort out the rest.
            </p>
          </div>

          <div>
            <label htmlFor="aeries-cert" className="block text-sm font-medium text-gray-900">
              Certificate
            </label>
            <input
              id="aeries-cert"
              // `password` so it is masked, excluded from autofill, and not
              // read aloud by screen readers in the clear.
              type="password"
              value={certificate}
              onChange={(e) => setCertificate(e.target.value)}
              placeholder={hasCredential ? 'Enter a new certificate to replace the saved one' : '32 letters and numbers'}
              autoComplete="off"
              spellCheck={false}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            {hasCredential ? (
              <p className="mt-1 text-xs text-gray-500">
                A certificate ending{' '}
                <span className="font-mono">{connection.credential_hint?.slice(-4)}</span> is saved.
                It can&apos;t be shown again — leave this blank unless you&apos;re replacing it.
              </p>
            ) : (
              <p className="mt-1 text-xs text-gray-500">
                From <span className="font-medium">Display Certificate Details</span> in Aeries.
                It&apos;s stored encrypted and never shown again.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={save}
            disabled={saving || !baseUrl.trim() || !certificate.trim()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : hasCredential ? 'Replace certificate' : 'Save and continue'}
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
              {report.areas.map((a) => (
                <AreaRow key={a.key} area={a} />
              ))}
            </ul>
            {!report.ok && (
              <p className="mt-4 text-xs text-gray-600">
                Fix the areas above in Aeries, then run the test again. Nothing needs to be
                re-entered here.
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
