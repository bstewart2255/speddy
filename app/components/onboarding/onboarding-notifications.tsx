"use client";

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { OnboardingBanner } from './onboarding-banner';

export function OnboardingNotifications() {
  const [showSetupBanner, setShowSetupBanner] = useState(false);
  const [showMultiSchoolBanner, setShowMultiSchoolBanner] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('works_at_multiple_schools, multi_school_banner_dismissed, setup_banner_dismissed')
        .eq('id', user.id)
        .single();

      // If the user has saved any per-site work schedule rows, treat the
      // multi-school banner's call to action as complete and hide it.
      const { data: siteSchedules } = await supabase
        .from('user_site_schedules')
        .select('id')
        .eq('user_id', user.id)
        .limit(1);

      const hasSiteSchedule = !!siteSchedules && siteSchedules.length > 0;

      // Check if user has students
      const { data: students } = await supabase
        .from('students')
        .select('id')
        .eq('provider_id', user.id)
        .limit(1);

      // Check if user has bell schedules
      const { data: bellSchedules } = await supabase
        .from('bell_schedules')
        .select('id')
        .eq('provider_id', user.id)
        .limit(1);

      // Check if user has special activities
      const { data: specialActivities } = await supabase
        .from('special_activities')
        .select('id')
        .eq('provider_id', user.id)
        .limit(1);

      // Determine if user needs setup (no students, bell schedules, or special activities)
      const needsSetup = (!students || students.length === 0) ||
                        (!bellSchedules || bellSchedules.length === 0) ||
                        (!specialActivities || specialActivities.length === 0);

      if (needsSetup && !profile?.setup_banner_dismissed) {
        setShowSetupBanner(true);
      }

      if (
        profile?.works_at_multiple_schools &&
        !profile.multi_school_banner_dismissed &&
        !hasSiteSchedule
      ) {
        setShowMultiSchoolBanner(true);
      }
    } catch (error) {
      console.error('Error checking onboarding status:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    checkOnboardingStatus();
  }, [checkOnboardingStatus]);

  const handleDismissSetupBanner = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setShowSetupBanner(false);

    const { error } = await supabase
      .from('profiles')
      .update({ setup_banner_dismissed: true })
      .eq('id', user.id);

    if (error) {
      console.error('Error persisting setup banner dismissal:', error);
      setShowSetupBanner(true);
    }
  };

  const handleDismissMultiSchoolBanner = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setShowMultiSchoolBanner(false);

    const { error } = await supabase
      .from('profiles')
      .update({ multi_school_banner_dismissed: true })
      .eq('id', user.id);

    if (error) {
      console.error('Error persisting multi-school banner dismissal:', error);
      setShowMultiSchoolBanner(true);
    }
  };

  if (loading) return null;

  return (
    <div>
      {showSetupBanner && (
        <OnboardingBanner
          message="Welcome to Speddy! To get started, please add your Students, Bell Schedule, and Special Activities information. This will enable you to schedule sessions effectively."
          onDismiss={handleDismissSetupBanner}
        />
      )}
      {showMultiSchoolBanner && (
        <OnboardingBanner
          message="We noticed you work at multiple schools. Please update your work schedule in Settings under User Profile to ensure accurate scheduling across all your sites."
          onDismiss={handleDismissMultiSchoolBanner}
          bgColor="bg-amber-50"
        />
      )}
    </div>
  );
}
