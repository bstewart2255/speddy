'use client';

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

export function HelpScoutBeaconIdentifier() {
  const supabase = createClient();

  useEffect(() => {
    const identifyUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user && window.Beacon) {
        // Get provider profile for support context
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role, school_district, school_site')
          .eq('id', user.id)
          .single();

        // Identify the signed-in provider to Help Scout Beacon. `name`/`email`
        // are reserved fields; the rest become custom attributes. No student
        // data is sent (a provider could still paste it into a chat message).
        window.Beacon('identify', {
          email: user.email,
          name: profile?.full_name,
          role: profile?.role,
          'school-district': profile?.school_district,
          'school-site': profile?.school_site,
          'user-id': user.id,
        });
      }
    };

    // Wait a moment for Beacon to initialize
    const timer = setTimeout(identifyUser, 1000);
    return () => clearTimeout(timer);
  }, [supabase]);

  return null;
}
