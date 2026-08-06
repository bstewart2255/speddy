'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';

/**
 * The district-side instructions for issuing Speddy an Aeries certificate
 * (SPE-396).
 *
 * Written for someone who has Aeries admin rights and has never opened the API
 * Security page. That means exact click paths and the exact box labels — not
 * "grant the necessary permissions", which is the sentence that generates a
 * support call.
 *
 * The permission list is copyable as a block because this person very often
 * isn't the one who will do the clicking: they forward it to a site tech or to
 * the county office. Every vendor who does this well (SIRAS, Xello, Clever)
 * publishes exactly this artifact.
 */

/** Exactly the areas `runAeriesConnectionTest` probes — keep the two in step. */
export const AERIES_PERMISSION_AREAS = [
  {
    label: 'Student Data',
    why: 'Names and grade levels, so we can match your students to the caseloads providers already entered.',
  },
  {
    label: 'Schools',
    why: 'The list of your schools, so services land at the right site.',
  },
  {
    label: 'Teacher/Staff Data',
    why: 'So a provider can pick a real teacher instead of typing a name.',
  },
  {
    label: 'Classes/Master Schedule',
    why: 'Which teacher a secondary student actually sees, period by period.',
  },
  {
    label: 'Student Programs',
    why: 'Where the special education flag lives. Without this one, Speddy cannot tell which students have an IEP.',
  },
] as const;

const COPYABLE = [
  'Aeries API Security setup for Speddy',
  '',
  '1. In Aeries: Security -> API Security -> Add New Record',
  '2. Product Name: Speddy',
  '3. Tick the READ-ONLY box for each of these areas:',
  ...AERIES_PERMISSION_AREAS.map((a) => `   - ${a.label}`),
  '4. Save, then click "Display Certificate Details" and copy the certificate.',
  '',
  'Speddy only ever reads. We never write anything back to Aeries.',
].join('\n');

export default function AeriesSetupGuide() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(COPYABLE);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard can be blocked by permissions policy. The steps are all on
      // screen anyway, so this is a convenience, not the only path.
      setCopied(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>How to create the Aeries credential</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-gray-600">
          You&apos;ll do this inside Aeries, not here. It takes about five minutes. If
          someone else manages your Aeries security settings, send them these steps.
        </p>

        <ol className="mt-5 space-y-4 text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
              1
            </span>
            <span>
              In Aeries, go to{' '}
              <span className="font-medium text-gray-900">
                Security → API Security → Add New Record
              </span>
              .
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
              2
            </span>
            <span>
              Set <span className="font-medium text-gray-900">Product Name</span> to{' '}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">Speddy</span>.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
              3
            </span>
            <div className="min-w-0">
              <p>
                Tick the <span className="font-medium text-gray-900">read-only</span> box for
                each area below. Read-only is the only access Speddy needs — we never write
                anything back to Aeries.
              </p>
              <ul className="mt-3 space-y-2">
                {AERIES_PERMISSION_AREAS.map((a) => (
                  <li key={a.label} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                    <span className="font-medium text-gray-900">{a.label}</span>
                    <p className="mt-0.5 text-xs text-gray-600">{a.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
              4
            </span>
            <span>
              Save the record, then click{' '}
              <span className="font-medium text-gray-900">Display Certificate Details</span> and
              copy the certificate. It&apos;s 32 letters and numbers.
            </span>
          </li>
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={copy}
            className="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
          >
            {copied ? 'Copied' : 'Copy these steps'}
          </button>
          <span className="text-xs text-gray-500">
            Sending this to whoever manages Aeries security? Copy the steps and paste them into
            an email.
          </span>
        </div>
      </CardBody>
    </Card>
  );
}
