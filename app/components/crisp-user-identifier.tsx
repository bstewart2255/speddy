'use client';

import { useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export function CrispUserIdentifier() {
  const supabase = createClientComponentClient();

  useEffect(() => {
    const identifyUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();

      if (user && window.$crisp) {
        // Get user profile for more details
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role, school_district, school_site')
          .eq('id', user.id)
          .single();

        // Set user email
        window.$crisp.push(['set', 'user:email', [user.email]]);

        // Set user nickname if we have their name
        if (profile?.full_name) {
          window.$crisp.push(['set', 'user:nickname', [profile.full_name]]);
        }

        // Set custom data
        if (profile) {
          window.$crisp.push(['set', 'session:data', [[
            ['role', profile.role],
            ['school_district', profile.school_district],
            ['school_site', profile.school_site],
            ['user_id', user.id]
          ]]]);
        }
      }
    };

    // Wait a bit for Crisp to initialize
    const timer = setTimeout(identifyUser, 1000);
    return () => clearTimeout(timer);
  }, [supabase]);

  return null;
}