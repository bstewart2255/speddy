"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useSchool } from '@/app/components/providers/school-context';
import { getSchoolKey } from '@/lib/school-helpers';
import {
  deriveProviderSetupItems,
  isProviderSetupRole,
  schedulesSessionsAtLevel,
  type ProviderSetupFacts,
} from '@/lib/onboarding/setup-guide';
import { getProviderSetupFacts } from '@/lib/supabase/queries/setup-guide';

/**
 * Provider setup guide (SPE-521) — replaces the old OnboardingNotifications
 * banners. A checklist beside the dashboard's main content, at "is the tool
 * in the drawer" altitude: every item auto-checks from real data
 * (school-wide for the shared items), nothing is a manual tick-box.
 *
 * Layout: pass the page's main content as `children` — while the guide has
 * something to show it renders children at ~70% width with the guide in a
 * ~30% column beside it; once the guide hides (complete + dismissed, or not
 * a provider) children get the full width. Keeping that decision in here
 * means the page never reserves an empty column.
 *
 * Visibility: full card while items remain; collapses to a progress pill on
 * dismiss (reusing profiles.setup_banner_dismissed); disappears entirely
 * once complete AND dismissed.
 */
export function SetupGuideCard({
  userRole,
  children,
}: {
  userRole: string;
  children?: ReactNode;
}) {
  const {
    currentSchool,
    isSecondary,
    worksAtMultipleSchools,
    loading: schoolLoading,
  } = useSchool();
  const supabase = useMemo(() => createClient(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [facts, setFacts] = useState<Omit<
    ProviderSetupFacts,
    'activitiesMarkedNone'
  > | null>(null);
  const [activitiesMarkedNone, setActivitiesMarkedNone] = useState(false);

  const isProvider = isProviderSetupRole(userRole);
  // The schedule-sessions item is omitted for some role/level combinations;
  // skip its (comparatively expensive) count queries in that case.
  const includeUnscheduledCount = schedulesSessionsAtLevel(
    userRole,
    isSecondary
  );
  const noneStorageKey =
    userId && currentSchool
      ? `speddy-setup-activities-none-${userId}-${getSchoolKey(currentSchool)}`
      : null;

  useEffect(() => {
    if (!isProvider) return;
    let cancelled = false;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || cancelled) return;
        setUserId(user.id);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('setup_banner_dismissed')
          .eq('id', user.id)
          .single();
        if (error) {
          // Unknown dismissal state: stay hidden rather than resurrect a
          // card the user may have dismissed.
          console.error('[SetupGuideCard] Failed to load profile:', error);
          return;
        }
        if (!cancelled) setDismissed(!!profile?.setup_banner_dismissed);
      } catch (error) {
        console.error('[SetupGuideCard] Failed to load profile:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isProvider, supabase]);

  useEffect(() => {
    if (!isProvider || !userId || !currentSchool) return;
    let cancelled = false;
    // Clear the previous school's facts so a multi-school switch never shows
    // one school's checkmarks against another school's items.
    setFacts(null);
    (async () => {
      try {
        const nextFacts = await getProviderSetupFacts(userId, currentSchool, {
          includeUnscheduledCount,
        });
        if (!cancelled) setFacts(nextFacts);
      } catch (error) {
        // Non-critical surface: stay hidden rather than show wrong states.
        console.error('[SetupGuideCard] Failed to load setup facts:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isProvider, userId, currentSchool, includeUnscheduledCount]);

  useEffect(() => {
    if (!noneStorageKey) return;
    try {
      setActivitiesMarkedNone(localStorage.getItem(noneStorageKey) === '1');
    } catch {
      setActivitiesMarkedNone(false);
    }
  }, [noneStorageKey]);

  const handleDismiss = useCallback(async () => {
    if (!userId) return;
    if (dismissed) {
      // Flag already stored — just collapse the re-opened card.
      setExpanded(false);
      return;
    }
    setDismissed(true);
    setExpanded(false);
    // Assert the write persisted, not just a 2xx: an RLS-filtered UPDATE
    // returns success with an empty body (SPE-332's lesson).
    const { data, error } = await supabase
      .from('profiles')
      .update({ setup_banner_dismissed: true })
      .eq('id', userId)
      .select('setup_banner_dismissed');
    if (error || !data?.length || data[0].setup_banner_dismissed !== true) {
      console.error('[SetupGuideCard] Failed to persist dismissal:', error);
      setDismissed(false);
    }
  }, [userId, dismissed, supabase]);

  const handleMarkNone = useCallback(
    (marked: boolean) => {
      if (!noneStorageKey) return;
      try {
        if (marked) {
          localStorage.setItem(noneStorageKey, '1');
        } else {
          localStorage.removeItem(noneStorageKey);
        }
      } catch {
        // Storage unavailable (private mode) — the state still applies for
        // this visit.
      }
      setActivitiesMarkedNone(marked);
    },
    [noneStorageKey]
  );

  const guide = (() => {
    if (!isProvider) return null;
    if (schoolLoading || !currentSchool || dismissed === null || !facts) {
      return null;
    }

    const items = deriveProviderSetupItems({
      role: userRole,
      isSecondary,
      worksAtMultipleSchools,
      facts: { ...facts, activitiesMarkedNone },
    });
    if (items.length === 0) return null;

    const doneCount = items.filter(item => item.state === 'done').length;
    const complete = doneCount === items.length;

    // Complete and dismissed: the guide's job is over.
    if (complete && dismissed) return null;

    const showPill = !expanded && (dismissed || complete);
    if (showPill) {
      return (
        <div
          role="status"
          className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2"
        >
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            {complete ? (
              <span className="inline-flex items-center gap-1.5">
                <CheckIcon className="h-4 w-4 text-green-600" />
                Setup complete
              </span>
            ) : (
              <>
                Setup guide · {doneCount} of {items.length} done
              </>
            )}
          </button>
          {complete && (
            <button
              type="button"
              onClick={handleDismiss}
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
            <h2 className="text-base font-semibold text-gray-900">
              Setup guide
            </h2>
            <p aria-live="polite" className="mt-0.5 text-sm text-gray-500">
              {doneCount} of {items.length} done
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
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
              ) : (
                <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-700">
                  <span className="sr-only">To do, step </span>
                  {index + 1}
                </span>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {item.state === 'done' ? (
                    <span className="text-sm font-medium text-gray-500">
                      {item.title}
                    </span>
                  ) : (
                    <Link
                      href={item.href}
                      className="text-sm font-medium text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      {item.title}
                    </Link>
                  )}
                  {item.shared && item.state !== 'done' && (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-500 whitespace-nowrap">
                      You or your site admin
                    </span>
                  )}
                </div>
                {item.state !== 'done' && (
                  <p className="mt-0.5 text-sm text-gray-500">
                    {item.description}
                    {item.shared &&
                      ' Ideally your site admin enters this once for the whole school — add it yourself if you would rather not wait.'}
                  </p>
                )}
                {item.id === 'special-activities' &&
                  (item.markedNone ? (
                    <button
                      type="button"
                      onClick={() => handleMarkNone(false)}
                      className="mt-1 text-xs text-gray-400 underline hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                    >
                      Marked as none — undo
                    </button>
                  ) : (
                    item.state === 'todo' && (
                      <button
                        type="button"
                        onClick={() => handleMarkNone(true)}
                        className="mt-1 text-xs text-gray-500 underline hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      >
                        My teachers have none
                      </button>
                    )
                  ))}
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  })();

  // Side-by-side layout: main content at ~70% with the guide beside it at
  // ~30%; full width the moment the guide has nothing to show.
  if (!guide) return <>{children ?? null}</>;
  if (!children) return guide;
  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-10">
      <div className="lg:col-span-7">{children}</div>
      <div className="lg:col-span-3">{guide}</div>
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
