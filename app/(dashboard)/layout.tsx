'use client';

import { useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import Navbar from '../components/navigation/navbar';
import Footer from '../components/navigation/footer';
import { ErrorBoundary } from '../components/ui/error-boundary';
import { SchoolProvider } from '../components/providers/school-context';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push('/login');
      } else {
        setLoading(false);
      }
    };
    checkUser();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <SchoolProvider>
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Navbar />
          <main className="flex-1 max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 w-full">
            {children}
          </main>
          <Footer />
        </div>
      </SchoolProvider>
    </ErrorBoundary>
  );
}