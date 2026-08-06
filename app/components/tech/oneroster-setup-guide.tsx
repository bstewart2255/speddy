'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';

/**
 * The district-side instructions for issuing Speddy OneRoster credentials
 * (SPE-397).
 *
 * Two warnings here are not decoration — they are the two things that stall a
 * OneRoster setup for days, and both are called out by name in the ticket:
 *
 *  1. **Aeries Support must be involved first.** An Aeries-hosted district's
 *     FIRST OneRoster connection needs certificate verification and an app-pool
 *     recycle on Aeries' side. A district that doesn't know this will tick every
 *     box correctly and still get nothing, with no error explaining why. Said up
 *     front, before the steps, because it has a lead time.
 *
 *  2. **OneRoster uses the Consumer ID and Secret, NOT the certificate.** Same
 *     admin page, adjacent fields, completely different credential. This is the
 *     single most common wrong paste, and the connection test names it too — but
 *     it is cheaper to prevent here than to diagnose there.
 */

export const ONEROSTER_STEPS = [
  {
    title: 'Turn OneRoster on',
    detail: 'District-level School Options → OneRoster Settings → Enable.',
  },
  {
    title: 'Add Speddy as a vendor',
    detail: 'Security → API Security → Add New Record, with Product Name "Speddy".',
  },
  {
    title: 'Tick the OneRoster box',
    detail: 'On that same record, tick OneRoster.',
  },
  {
    title: 'Copy the Consumer ID and Secret Key',
    detail: 'Click "Display Consumer ID & Secret Keys" and copy both.',
  },
] as const;

const COPYABLE = [
  'Aeries OneRoster setup for Speddy',
  '',
  'BEFORE STARTING: if this is the district\'s first OneRoster connection and',
  'Aeries hosts us, contact Aeries Support first. They need to verify the',
  'certificate and recycle the app pool, and nothing works until they have.',
  '',
  ...ONEROSTER_STEPS.map((s, i) => `${i + 1}. ${s.title}\n   ${s.detail}`),
  '',
  'IMPORTANT: OneRoster uses the Consumer ID and Consumer Secret Key, NOT the',
  'certificate. They are on the same page, right next to each other.',
  '',
  'Speddy only ever reads. We never write anything back to Aeries.',
].join('\n');

export default function OneRosterSetupGuide() {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending reset on unmount, and before scheduling a new one: two
  // clicks inside the reset window would otherwise have the first timer wipe
  // the second confirmation.
  useEffect(() => () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
  }, []);

  const copy = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await navigator.clipboard.writeText(COPYABLE);
      setCopyState('copied');
    } catch {
      // Clipboard access can be denied by permissions policy. Say so — the
      // silent version leaves the button reading "Copy these steps" and the
      // user believing it worked. The steps are all on screen either way.
      setCopyState('failed');
    }
    resetTimer.current = setTimeout(() => setCopyState('idle'), 2500);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>How to create your OneRoster credentials</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            Start here if this is your first OneRoster connection
          </p>
          <p className="mt-1 text-sm text-amber-800">
            If Aeries hosts your district, contact Aeries Support before you begin. Your first
            OneRoster connection needs them to verify the certificate and recycle the app pool on
            their side. Everything below will look correct and still return nothing until they
            have done that — so it is worth starting that request now.
          </p>
        </div>

        <p className="mt-5 text-sm text-gray-600">
          You&apos;ll do this inside Aeries, not here. If someone else manages your Aeries security
          settings, send them these steps.
        </p>

        <ol className="mt-5 space-y-4 text-sm text-gray-700">
          {ONEROSTER_STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
                {i + 1}
              </span>
              <span>
                <span className="font-medium text-gray-900">{step.title}.</span> {step.detail}
              </span>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">
            The one that catches nearly everyone
          </p>
          <p className="mt-1 text-sm text-amber-800">
            OneRoster uses the <span className="font-medium">Consumer ID</span> and{' '}
            <span className="font-medium">Consumer Secret Key</span> — not the certificate. All
            three sit on the same page, right next to each other. If you paste the certificate,
            the connection test will tell you so, but it saves a round trip to know now.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {copyState === 'copied' ? 'Copied' : 'Copy these steps'}
          </button>
          <span role="status" aria-live="polite" className="text-xs text-gray-500">
            {copyState === 'copied'
              ? 'Steps copied.'
              : copyState === 'failed'
                ? 'Copy failed — select the steps above and copy them manually.'
                : 'Sending this to whoever manages Aeries security? Copy the steps and paste them into an email.'}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
