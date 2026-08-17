"use client";

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useSchool } from '@/app/components/providers/school-context';
import { getSchoolKey } from '@/lib/school-helpers';
import {
  deriveProviderSetupItems,
  isProviderSetupRole,
  schedulesSessionsAtLevel,
  type ProviderSetupFacts,
  type SetupGuideItem,
} from '@/lib/onboarding/setup-guide';
import { getProviderSetupFacts } from '@/lib/supabase/queries/setup-guide';
import { SetupGuideView } from './setup-guide-view';
import { useSetupGuideDismissal } from './use-setup-guide-dismissal';

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

  const [facts, setFacts] = useState<Omit<
    ProviderSetupFacts,
    'activitiesMarkedNone'
  > | null>(null);
  const [activitiesMarkedNone, setActivitiesMarkedNone] = useState(false);

  const isProvider = isProviderSetupRole(userRole);
  const { userId, dismissed, expanded, setExpanded, handleDismiss } =
    useSetupGuideDismissal(isProvider);
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

  const renderItemExtra = useCallback(
    (item: SetupGuideItem): ReactNode => {
      if (item.id !== 'special-activities') return null;
      if (item.markedNone) {
        return (
          <button
            type="button"
            onClick={() => handleMarkNone(false)}
            className="mt-1 text-xs text-gray-400 underline hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            Marked as none — undo
          </button>
        );
      }
      if (item.state === 'todo') {
        return (
          <button
            type="button"
            onClick={() => handleMarkNone(true)}
            className="mt-1 text-xs text-gray-500 underline hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          >
            My teachers have none
          </button>
        );
      }
      return null;
    },
    [handleMarkNone]
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

    // Complete and dismissed: the guide's job is over.
    const complete = items.every(item => item.state === 'done');
    if (complete && dismissed) return null;

    return (
      <SetupGuideView
        items={items}
        dismissed={dismissed}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onDismiss={handleDismiss}
        renderItemExtra={renderItemExtra}
      />
    );
  })();

  // Side-by-side layout: main content at ~70% with the guide beside it at
  // ~30%; full width the moment the guide has nothing to show. Grid items
  // stretch, so the schedule card (given h-full by the page) matches the
  // guide's height even when it has no sessions to show; the pill keeps its
  // natural height, top-aligned in its cell.
  if (!guide) return <>{children ?? null}</>;
  if (!children) return guide;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-10">
      <div className="lg:col-span-7">{children}</div>
      <div className="lg:col-span-3">{guide}</div>
    </div>
  );
}
