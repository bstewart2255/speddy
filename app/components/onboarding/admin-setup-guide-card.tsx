"use client";

import { useEffect, useRef, useState } from 'react';
import type { SetupGuideItem } from '@/lib/onboarding/setup-guide';
import { SetupGuideView } from './setup-guide-view';
import { useSetupGuideDismissal } from './use-setup-guide-dismissal';

/**
 * Shared shell for the admin setup guides — site admin (SPE-522) and
 * district admin (SPE-523) differ only in how their checklist items are
 * loaded, so the page passes a loader and this owns the rest: fetch with
 * cancellation, dismissal (profiles.setup_banner_dismissed), collapse to a
 * pill, and disappearing for good once complete + dismissed.
 */
export function AdminSetupGuideCard({
  loadItems,
  reloadKey,
}: {
  /** Fetches facts and derives the checklist for this audience. */
  loadItems: () => Promise<SetupGuideItem[]>;
  /** Scope identity (school/district id); a change reloads the items. */
  reloadKey: string;
}) {
  const [items, setItems] = useState<SetupGuideItem[] | null>(null);
  const { dismissed, expanded, setExpanded, handleDismiss } =
    useSetupGuideDismissal(true);

  // The loader closure is recreated on every page render; keep the latest in
  // a ref so the effect re-runs only when the scope actually changes.
  const loadItemsRef = useRef(loadItems);
  loadItemsRef.current = loadItems;

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    (async () => {
      try {
        const next = await loadItemsRef.current();
        if (!cancelled) setItems(next);
      } catch (error) {
        // Non-critical surface: stay hidden rather than show wrong states.
        console.error('[AdminSetupGuideCard] Failed to load items:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  if (dismissed === null || !items) return null;

  const complete = items.every(item => item.state === 'done');
  if (complete && dismissed) return null;

  return (
    <div className="mb-8">
      <SetupGuideView
        items={items}
        dismissed={dismissed}
        expanded={expanded}
        onExpand={() => setExpanded(true)}
        onDismiss={handleDismiss}
      />
    </div>
  );
}
