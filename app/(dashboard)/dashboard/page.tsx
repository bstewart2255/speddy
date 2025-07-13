"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StatCard } from '../../components/ui/stats';
import { StatsGrid, StudentStats, SessionStats, CompletionStats } from '../../components/ui/stats';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { TodoWidget } from '../../components/todo-widget';
import { WeeklyView } from '../../components/weekly-view';
import { GroupSessionsWidget } from "../../../app/components/group-sessions-widget";
import { OnboardingNotifications } from '../../components/onboarding/onboarding-notifications';
import Link from 'next/link';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.push('/login');
          return;
        }

        // Get user's role
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);

          // Redirect SEAs to their specific dashboard
          if (profile.role === 'sea') {
            router.push('/dashboard/sea');
            return;
          }
        }
      } catch (error) {
        console.error('Error getting user role:', error);
      } finally {
        setLoading(false);
      }
    };

    checkUserRole();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  // This will only render for non-SEA roles
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
        </div>
        
        {/* Onboarding Notifications */}
        <OnboardingNotifications />
        
        {/* Main Content Area */}
        <div className="space-y-4">
          <WeeklyView viewMode="provider" />

          {/* Two column layout with different behavior */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* Left column - Todo widget can expand */}
            <div>
              <TodoWidget />
            </div>
            

            {/* Right column - Fixed height widgets */}
            <div className="space-y-4">
              <GroupSessionsWidget />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
