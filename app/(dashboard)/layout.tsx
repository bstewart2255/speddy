'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Navbar from '../components/navigation/navbar';
import Footer from '../components/navigation/footer';
import { DashboardErrorBoundary, AsyncErrorBoundary } from '../components/ui/dashboard-error-boundary';
import { SchoolProvider } from '../components/providers/school-context';
import { CrispUserIdentifier } from '../components/crisp-user-identifier';
import { log } from '@/lib/monitoring/logger';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          log.error('Error fetching user in dashboard layout', error);
          router.push('/login');
          return;
        }
        
        if (!user) {
          router.push('/login');
        } else {
          setLoading(false);
        }
      } catch (error) {
        log.error('Unexpected error in dashboard layout auth check', error);
        router.push('/login');
      }
    };
    
    checkUser();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardErrorBoundary
      onError={(error, errorInfo) => {
        // Additional error handling logic can be added here
        // For example, sending errors to an external service
      }}
    >
      <AsyncErrorBoundary>
        <SchoolProvider>
          <div className="min-h-screen bg-gray-50 flex flex-col">
            <DashboardErrorBoundary>
              <Navbar />
            </DashboardErrorBoundary>
            <CrispUserIdentifier />
            <main className="flex-1 max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 w-full">
              <DashboardErrorBoundary>
                {children}
              </DashboardErrorBoundary>
            </main>
            <Footer />
          </div>
        </SchoolProvider>
      </AsyncErrorBoundary>
    </DashboardErrorBoundary>
  );
}