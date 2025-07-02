'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
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
  const supabase = createClientComponentClient();
  const [userRole, setUserRole] = useState<string>("");

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);

      // Get user's role if logged in
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile) {
          setUserRole(profile.role);
        }
      }
    };
    getUser();
  }, [supabase.auth]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getNavigationForRole = (role: string) => {
    const baseNavigation = [
      { name: 'Dashboard', href: '/dashboard' }
    ];

    if (role === 'sea') {
      // SEAs only see their dashboard
      return [
        { name: 'Dashboard', href: '/dashboard/sea' },
      ];
      
    } else if (role === 'resource') {
      // Resource Specialists see everything including team management
      return [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Students', href: '/dashboard/students' },
        { 
          name: 'Schedule', 
          href: '/dashboard/schedule',
          subItems: [
            { name: 'Bell Schedules', href: '/dashboard/bell-schedules' },
            { name: 'Special Activities', href: '/dashboard/special-activities' }
          ]
        },
      ];
    } else {
      // Other roles (speech, ot, counseling, specialist) see standard navigation
      return [
        { name: 'Dashboard', href: '/dashboard' },
        { name: 'Students', href: '/dashboard/students' },
        { name: 'Bell Schedules', href: '/dashboard/bell-schedules' },
        { name: 'Special Activities', href: '/dashboard/special-activities' },
        { name: 'Schedule', href: '/dashboard/schedule' },
      ];
    }
  };

  const navigation = getNavigationForRole(userRole);

  return (
    <nav className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Brand/Logo */}
          <div className="flex-shrink-0">
            <span className="text-xl font-bold text-gray-900">Speddy</span>
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

          {/* User Section */}
          <div className="flex items-center gap-4">
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