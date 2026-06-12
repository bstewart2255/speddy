'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

/**
 * Identifies the signed-in provider to the Help Scout Beacon widget so support
 * conversations carry their account context (email, name, role, school, user id).
 * Sends provider PII only — never student data. Renders nothing.
 */
export function HelpScoutBeaconIdentifier() {
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;

    const identifyUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const beacon = window.Beacon;
      if (cancelled || !user || !beacon) return;

      // Get provider profile for support context
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role, school_district, school_site')
        .eq('id', user.id)
        .single();
      if (cancelled) return;

      // Identify the signed-in provider to Help Scout Beacon. `name`/`email`
      // are reserved fields; the rest become custom attributes. No student
      // data is sent (a provider could still paste it into a chat message).
      beacon('identify', {
        email: user.email,
        name: profile?.full_name,
        role: profile?.role,
        'school-district': profile?.school_district,
        'school-site': profile?.school_site,
        'user-id': user.id,
      });
    };

    // The Beacon snippet loads via an afterInteractive <Script> with no
    // guaranteed ordering vs. this effect, so poll until Beacon is available,
    // then identify once (~6s max). A one-shot timeout could miss the load.
    let attempts = 0;
    const interval = setInterval(() => {
      attempts += 1;
      if (window.Beacon) {
        clearInterval(interval);
        void identifyUser();
      } else if (attempts >= 20) {
        clearInterval(interval);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [supabase]);

  return null;
}
