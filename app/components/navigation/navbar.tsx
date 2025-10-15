'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import UserProfileDropdown from './user-profile-dropdown';
import { SchoolSwitcher } from '../school-switcher';

type NavigationItem = {
  name: string;
  href: string;
  subItems?: NavigationItem[];
};

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Get user's role if logged in
      if (user) {
        console.log('[Navbar] Fetching role for user:', user.id);
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('[Navbar] Error fetching role:', {
            error,
            message: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            status: (error as any).status
          });
        }

        if (profile) {
          setUserRole(profile.role);
          console.log('[Navbar] User role:', profile.role);
        }
      }
    };
    getUser();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getNavigationForRole = (role: string) => {
    const baseNavigation = [
      { name: 'Dashboard', href: '/dashboard' }
    ];

    if (role === 'sea') {
      // SEAs see their dashboard, students (view-only), and lessons
      return [
        { name: 'Dashboard', href: '/dashboard/sea' },
        { name: 'Students', href: '/dashboard/students' },
        { name: 'Lessons', href: '/dashboard/lessons' },
      ];
      
    } else if (role === 'resource') {
      // Resource Specialists see everything including team management
      return [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Students', href: '/dashboard/students' },
        { name: 'Calendar', href: '/dashboard/calendar' },
        { 
          name: 'Schedule', 
          href: '/dashboard/schedule',
          subItems: [
            { name: 'Main Schedule', href: '/dashboard/schedule' },
            { name: 'Bell Schedules', href: '/dashboard/bell-schedules' },
            { name: 'Special Activities', href: '/dashboard/special-activities' }
          ]
        },
        { name: 'Lessons', href: '/dashboard/lessons' },
      ];
    } else {
      // Other roles (speech, ot, counseling, specialist) see standard navigation
      return [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Students', href: '/dashboard/students' },
        { name: 'Calendar', href: '/dashboard/calendar' },
        { 
          name: 'Schedule', 
          href: '/dashboard/schedule',
          subItems: [
            { name: 'Main Schedule', href: '/dashboard/schedule' },
            { name: 'Bell Schedules', href: '/dashboard/bell-schedules' },
            { name: 'Special Activities', href: '/dashboard/special-activities' }
          ]
        },
        { name: 'Lessons', href: '/dashboard/lessons' },
      ];
    }
  };

  const navigation = getNavigationForRole(userRole);

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
        {/* Left side: Logo and Navigation */}
        <div className="flex items-center h-full space-x-10">
          {/* Brand/Logo */}
          <div className="flex-shrink-0">
            <span className="text-2xl font-logo text-gray-900">Speddy</span>
          </div>
  
          {/* Navigation Links */}
          <div className="hidden sm:flex sm:space-x-8 h-full">
            {navigation.map((item) => (
                item.subItems ? (
                  <div key={item.name} className="relative group h-full">
                    <div className="inline-flex items-center h-full">
                      <Link
                        href={item.href}
                        className={`inline-flex items-center px-1 border-b-2 text-sm font-medium transition-colors h-full ${
                          pathname.startsWith(item.href)
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        {item.name}
                      </Link>
                      <button
                        className={`inline-flex items-center px-1 border-b-2 text-sm font-medium transition-colors h-full ${
                          pathname.startsWith(item.href)
                            ? 'border-blue-500 text-blue-600'
                            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }`}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    </div>
                    <div className="absolute left-0 mt-0 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                      <div className="py-1">
                        {item.subItems.map((subItem) => (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            className={`block px-4 py-2 text-sm ${
                              pathname === subItem.href
                                ? 'bg-gray-100 text-gray-900'
                                : 'text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            {subItem.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`inline-flex items-center px-1 border-b-2 text-sm font-medium transition-colors h-full ${
                    pathname === item.href
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {item.name}
                </Link>
              )
            ))}
          </div>
        </div>
          
          {/* User Section */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                if (window.$crisp) {
                  window.$crisp.push(['do', 'chat:show']);
                  window.$crisp.push(['do', 'chat:open']);
                }
              }}
              className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md hover:bg-gray-100 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help
            </button>
            <SchoolSwitcher />
            {user && <UserProfileDropdown user={user} />}
          </div>
        </div>
      </div>

      {/* Mobile menu (you can expand this later if needed) */}
      <div className="sm:hidden">
        <div className="pt-2 pb-3 space-y-1 border-t border-gray-200 bg-gray-50">
          {navigation.map((item) => (
            <Link
              key={`mobile-${item.name}`}
              href={item.href}
              className={`block pl-3 pr-4 py-2 text-base font-medium transition-colors ${
                pathname === item.href
                  ? 'text-blue-600 bg-blue-50 border-r-2 border-blue-500'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
              }`}
            >
              {item.name}
            </Link>
          ))}
          {user && (
            <div className="pt-4 pb-3 border-t border-gray-200">
              <div className="px-4">
                <div className="text-sm text-gray-500">{user.email}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}