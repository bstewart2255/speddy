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

      // Check if user has dismissed banners (stored in localStorage)
      const dismissedSetup = localStorage.getItem(`dismissed-setup-banner-${user.id}`);
      const dismissedMultiSchool = localStorage.getItem(`dismissed-multi-school-banner-${user.id}`);

      // Check if user works at multiple schools
      const { data: providerSchools } = await supabase
        .from('provider_schools')
        .select('id')
        .eq('provider_id', user.id);

      const worksAtMultipleSchools = providerSchools && providerSchools.length > 1;

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

      // Show setup banner if needed and not dismissed
      if (needsSetup && !dismissedSetup) {
        setShowSetupBanner(true);
      }

      // Show multi-school banner if applicable and not dismissed
      if (worksAtMultipleSchools && !dismissedMultiSchool) {
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
    if (user) {
      localStorage.setItem(`dismissed-setup-banner-${user.id}`, 'true');
      setShowSetupBanner(false);
    }
  };

  const handleDismissMultiSchoolBanner = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      localStorage.setItem(`dismissed-multi-school-banner-${user.id}`, 'true');
      setShowMultiSchoolBanner(false);
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
