'use client';

import { WorkScheduleSettings } from '../../../components/settings/work-schedule';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CurriculumsSettings } from '../../../components/settings/curriculums';
import { PasswordResetRequest } from '../../../components/settings/password-reset-request';
import { ApiKeysSettings } from '../../../components/settings/api-keys';

export default function SettingsPage() {
  const [userProfile, setUserProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadUserProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      setUserProfile(profile);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-2 text-gray-600">Manage your account settings and preferences</p>
        </div>

        <div className="space-y-6">
          {/* User Profile Info */}
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Name</label>
                  <p className="mt-1 text-sm text-gray-900">{userProfile?.full_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Email</label>
                  <p className="mt-1 text-sm text-gray-900">{userProfile?.email}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Role</label>
                  <p className="mt-1 text-sm text-gray-900 capitalize">{userProfile?.role}</p>
                </div>
              </div>
            </CardBody>
          </Card>

        {/* Work Schedule Settings - Only show if user works at multiple schools */}
          {userProfile?.works_at_multiple_schools && (
            <WorkScheduleSettings />
          )}

          {/* Curriculums Settings */}
          <CurriculumsSettings />

          {/* API Keys - For providers to use Chrome Extension
              TEMPORARILY HIDDEN: Chrome extension feature is not ready for release yet.
              To restore: uncomment the ApiKeysSettings component below.
              See PR #552 for extension implementation details.
          */}
          {/* {['resource', 'speech', 'ot', 'counseling', 'sea', 'psychologist', 'specialist'].includes(userProfile?.role) && (
            <ApiKeysSettings />
          )} */}

          {/* Password Reset Request - Only for providers */}
          {['resource', 'speech', 'ot', 'counseling', 'sea', 'psychologist', 'specialist'].includes(userProfile?.role) && (
            <PasswordResetRequest
              requestedAt={userProfile?.password_reset_requested_at}
              onRequestSubmitted={loadUserProfile}
            />
          )}
        </div>
      </div>
    </div>
  );
}