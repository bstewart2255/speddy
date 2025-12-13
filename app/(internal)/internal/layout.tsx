'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { log } from '@/lib/monitoring/logger';

export default function InternalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser();

        if (error || !user) {
          log.error('No user in internal layout', error);
          router.push('/login');
          return;
        }

        // Verify speddy admin access
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('is_speddy_admin, email')
          .eq('id', user.id)
          .single();

        if (profileError || !profile?.is_speddy_admin) {
          log.warn('Non-speddy-admin tried to access internal portal', { userId: user.id });
          router.push('/dashboard');
          return;
        }

        setUserEmail(profile.email);
        setLoading(false);
      } catch (error) {
        log.error('Unexpected error in internal layout auth check', error);
        router.push('/login');
      }
    };

    checkAccess();
  }, [router, supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-center space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
          <p className="text-slate-400">Loading internal portal...</p>
        </div>
      </div>
    );
  }

  const navLinks = [
    { href: '/internal', label: 'Home', exact: true },
    { href: '/internal/districts', label: 'Districts' },
    { href: '/internal/create-admin', label: 'Create Admin' },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and branding */}
            <div className="flex items-center space-x-4">
              <Link href="/internal" className="flex items-center space-x-2">
                <span className="text-xl font-bold text-white">Speddy</span>
                <span className="px-2 py-0.5 text-xs font-semibold bg-purple-600 text-white rounded">
                  INTERNAL
                </span>
              </Link>
            </div>

            {/* Navigation */}
            <nav className="flex items-center space-x-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive(link.href, link.exact)
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* User info and sign out */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-400">{userEmail}</span>
              <button
                onClick={handleSignOut}
                className="text-sm text-slate-400 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-slate-800 border-t border-slate-700 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-500">
            Speddy Internal Admin Portal - For authorized team members only
          </p>
        </div>
      </footer>
    </div>
  );
}
