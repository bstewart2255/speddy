"use client";

import { useEffect, useState } from 'react';
import {
  deriveSiteAdminSetupItems,
  type SiteAdminSetupFacts,
} from '@/lib/onboarding/setup-guide';
import { getSiteAdminSetupFacts } from '@/lib/supabase/queries/setup-guide';
import { SetupGuideView } from './setup-guide-view';
import { useSetupGuideDismissal } from './use-setup-guide-dismissal';

/**
 * Site admin setup guide (SPE-522): the school-launch checklist on
 * /dashboard/admin, at drawer altitude — school facts, teacher & staff
 * lists, the school-wide schedule data (the flip side of the provider
 * guide's shared items), and the caseload pulse-check. Introduces the
 * "waiting" state: items blocked on someone else name who.
 *
 * The page passes the admin's granted school_id; the card renders nothing
 * until its facts load, and disappears for good once complete + dismissed
 * (reusing profiles.setup_banner_dismissed).
 */
export function SiteAdminSetupGuideCard({ schoolId }: { schoolId: string }) {
  const [facts, setFacts] = useState<{
    isSecondary: boolean;
    facts: SiteAdminSetupFacts;
  } | null>(null);
  const { dismissed, expanded, setExpanded, handleDismiss } =
    useSetupGuideDismissal(true);

  useEffect(() => {
    let cancelled = false;
    setFacts(null);
    (async () => {
      try {
        const next = await getSiteAdminSetupFacts(schoolId);
        if (!cancelled) setFacts(next);
      } catch (error) {
        // Non-critical surface: stay hidden rather than show wrong states.
        console.error(
          '[SiteAdminSetupGuideCard] Failed to load setup facts:',
          error
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  if (dismissed === null || !facts) return null;

  const items = deriveSiteAdminSetupItems(facts);
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
