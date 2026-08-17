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
import { SetupGuideCard } from '../../components/onboarding/setup-guide-card';
import { AttendanceWidget } from '../../components/dashboard/attendance-widget';
import { ToastProvider } from '../../contexts/toast-context';
import { useSchool } from '../../components/providers/school-context';
import { canScheduleAtSecondary } from '@/lib/school-helpers';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const router = useRouter();
  const supabase = createClient();
  const { isSecondary } = useSchool();

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

          // Redirect teachers to their specific dashboard
          if (profile.role === 'teacher') {
            router.push('/dashboard/teacher');
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
    <ToastProvider>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Dashboard</h1>
          </div>

          {/* Main Content Area */}
          <div className="space-y-4">
            {/* Setup guide (SPE-521) sits beside Today's Schedule (70/30)
                while it has items to show; the wrapper hands the width back
                the moment the guide hides (complete + dismissed, or not a
                provider role).
                The Weekly view itself doesn't apply on secondary (middle/high)
                sites — except for related-service roles, which schedule
                sessions at secondary too (SPE-490). Attendance stays
                elementary-only. */}
            <SetupGuideCard userRole={userRole}>
              {!isSecondary || canScheduleAtSecondary(userRole) ? (
                <WeeklyView viewMode="provider" className="h-full" />
              ) : undefined}
            </SetupGuideCard>

            <div className={`grid grid-cols-1 gap-4 ${isSecondary ? '' : 'lg:grid-cols-2'}`}>
              {!isSecondary && <AttendanceWidget />}
              <TodoWidget />
            </div>
          </div>
        </div>
      </div>
    </ToastProvider>
  );
}
