"use client";

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { SetupGuideItem } from '@/lib/onboarding/setup-guide';

/**
 * Presentational half of the setup guides (SPE-521/522): the collapsed
 * progress pill and the expanded checklist card, for items in any of the
 * three states (done / todo / waiting). Audience cards own the data loading,
 * derivation, and dismissal persistence; this renders whatever they derive.
 *
 * Callers decide visibility: when the guide is complete AND dismissed they
 * simply don't render this view.
 */
export function SetupGuideView({
  items,
  dismissed,
  expanded,
  onExpand,
  onDismiss,
  renderItemExtra,
}: {
  items: SetupGuideItem[];
  dismissed: boolean;
  expanded: boolean;
  onExpand: () => void;
  onDismiss: () => void;
  /** Audience-specific per-item controls (e.g. the provider "none" escape hatch). */
  renderItemExtra?: (item: SetupGuideItem) => ReactNode;
}) {
  const doneCount = items.filter(item => item.state === 'done').length;
  const complete = doneCount === items.length;

  const showPill = !expanded && (dismissed || complete);
  if (showPill) {
    return (
      <div
        role="status"
        className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2"
      >
        <button
          type="button"
          onClick={onExpand}
          className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        >
          {complete ? (
            <span className="inline-flex items-center gap-1.5">
              <CheckIcon className="h-4 w-4 text-green-600" />
              Setup complete
            </span>
          ) : (
            <>
              Setup Guide · {doneCount} of {items.length} done
            </>
          )}
        </button>
        {complete && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss setup guide"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <XIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Setup Guide</h2>
          <p aria-live="polite" className="mt-0.5 text-sm text-gray-500">
            {doneCount} of {items.length} done
          </p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={
            dismissed ? 'Collapse setup guide' : 'Dismiss setup guide'
          }
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <ol className="space-y-3">
        {items.map((item, index) => (
          <li key={item.id} className="flex items-start gap-2.5">
            {item.state === 'done' ? (
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-green-100">
                <CheckIcon className="h-3 w-3 text-green-700" />
                <span className="sr-only">Done:</span>
              </span>
            ) : item.state === 'waiting' ? (
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
                <ClockIcon className="h-3 w-3 text-amber-700" />
                <span className="sr-only">Waiting: </span>
              </span>
            ) : (
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                <span className="sr-only">To do, step </span>
                {index + 1}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                {item.state !== 'done' && item.href ? (
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {item.title}
                  </Link>
                ) : (
                  <span
                    className={`text-sm font-medium ${item.state === 'done' ? 'text-gray-500' : 'text-gray-900'}`}
                  >
                    {item.title}
                  </span>
                )}
                {item.state === 'waiting' && item.waitingOn && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700 whitespace-nowrap">
                    Waiting on {item.waitingOn}
                  </span>
                )}
                {item.sharedWith && item.state === 'todo' && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 whitespace-nowrap">
                    {item.sharedWith}
                  </span>
                )}
              </div>
              {item.state !== 'done' && (
                <p className="mt-0.5 text-sm text-gray-500">
                  {item.description}
                </p>
              )}
              {renderItemExtra?.(item)}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.2 7.3a1 1 0 0 1-1.427.006l-3.3-3.3a1 1 0 1 1 1.414-1.414l2.588 2.588 6.505-6.588a1 1 0 0 1 1.414-.006Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-12.25a.75.75 0 0 0-1.5 0v4.25c0 .27.144.518.377.652l3 1.73a.75.75 0 1 0 .746-1.3L10.75 9.567V5.75Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
    </svg>
  );
}
