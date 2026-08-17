"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Shared dismissal state for the setup guides (SPE-521/522): loads the
 * current user's profiles.setup_banner_dismissed flag, and persists a
 * dismissal with a rows-affected check — an RLS-filtered UPDATE returns
 * success with an empty body (SPE-332's lesson), so a 2xx alone is not
 * proof the flag stuck.
 *
 * `dismissed` stays null while unknown (initial load, or a failed profile
 * read) so callers hide the guide rather than resurrect one the user may
 * have dismissed.
 */
export function useSetupGuideDismissal(enabled: boolean) {
  const supabase = useMemo(() => createClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
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
          console.error('[SetupGuide] Failed to load profile:', error);
          return;
        }
        if (!cancelled) setDismissed(!!profile?.setup_banner_dismissed);
      } catch (error) {
        console.error('[SetupGuide] Failed to load profile:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, supabase]);

  const handleDismiss = useCallback(async () => {
    if (!userId) return;
    if (dismissed) {
      // Flag already stored — just collapse the re-opened card.
      setExpanded(false);
      return;
    }
    setDismissed(true);
    setExpanded(false);
    const { data, error } = await supabase
      .from('profiles')
      .update({ setup_banner_dismissed: true })
      .eq('id', userId)
      .select('setup_banner_dismissed');
    if (error || !data?.length || data[0].setup_banner_dismissed !== true) {
      console.error('[SetupGuide] Failed to persist dismissal:', error);
      setDismissed(false);
    }
  }, [userId, dismissed, supabase]);

  return { userId, dismissed, expanded, setExpanded, handleDismiss };
}
