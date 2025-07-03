"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { StatCard } from '../../components/ui/stats';
import { StatsGrid, StudentStats, SessionStats, CompletionStats } from '../../components/ui/stats';
import { Card, CardHeader, CardTitle, CardBody } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { TodoWidget } from '../../components/todo-widget';
import { WeeklyView } from '../../components/weekly-view';
import { GroupSessionsWidget } from "../../../app/components/group-sessions-widget";
import Link from 'next/link';

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const router = useRouter();
  const supabase = createClientComponentClient();

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
        {/* Main Content Area */}
        <div className="space-y-4">
          <WeeklyView />
          <div className="grid gap-4 md:grid-cols-2">
            <TodoWidget />
            <GroupSessionsWidget />
          </div>
          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Link 
              href="/dashboard/lessons"
              className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Saved Lessons</h3>
                  <p className="text-sm text-gray-600 mt-1">View and print your AI-generated lessons</p>
                </div>
                <svg className="w-8 h-8 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}