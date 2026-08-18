'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { LongHoverTooltip } from '../ui/long-hover-tooltip';

/** What the dropdown actually renders, with org names already resolved. */
interface Profile {
  full_name: string;
  role: string;
  districtName: string;
  schoolSite: string;
}

/** An embedded row arrives as an object or (per the types) an array — see `embedded`. */
type Embed<T> = T | T[] | null | undefined;

interface NamedRef {
  name?: string | null;
}

interface SchoolRef extends NamedRef {
  district?: Embed<NamedRef>;
}

/**
 * Read a single row out of a many-to-one embed.
 *
 * PostgREST sends these as a single object (verified against the live API), but
 * supabase-js infers an array when the client is untyped. The two disagree, so
 * accept either. Trusting the types here and indexing `[0]` on the object that
 * actually arrives is what silently broke the district name in
 * `school-context.tsx` — its enriched `display_name` never sets.
 */
function embedded<T>(rel: Embed<T>): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

/**
 * First non-blank name wins. Accounts created through the admin routes carry
 * correct `district_id`/`school_id` but write '' to the legacy `school_district`
 * / `school_site` text columns, so reading the text alone renders a labelled
 * blank — which is the bug this resolves.
 */
function orgName(...candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) return trimmed;
  }
  return '';
}

export default function UserProfileDropdown({ user }: { user: User }) {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          full_name,
          role,
          school_district,
          school_site,
          district:district_id ( name ),
          school:school_id ( name, district:district_id ( name ) )
        `)
        .eq('id', user.id)
        .single();

      if (data && !error) {
        // Prefer the structured hierarchy over the legacy text columns. A
        // provider's district hangs off their own profile; a teacher's is
        // reachable only through their school, hence the extra hop.
        const school = embedded<SchoolRef>(data.school);
        setProfile({
          full_name: data.full_name,
          role: data.role,
          districtName: orgName(
            embedded<NamedRef>(data.district)?.name,
            embedded<NamedRef>(school?.district)?.name,
            data.school_district,
          ),
          schoolSite: orgName(school?.name, data.school_site),
        });
      }
    };

    if (user) {
      fetchProfile();
    }
  }, [user, supabase]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return user.email?.[0].toUpperCase() || 'U';
  };

  const getRoleDisplay = (role: string) => {
    const roleMap: { [key: string]: string } = {
      'resource': 'Resource Specialist',
      'speech': 'Speech Therapist',
      'ot': 'Occupational Therapist',
      'counseling': 'Counselor',
      'specialist': 'Program Specialist',
      'sea': 'Special Education Assistant',
      'district_tech': 'District Tech Admin'
    };
    return roleMap[role] || role;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Icon Button */}
      <LongHoverTooltip content="Access your account settings, preferences, and sign out option.">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          aria-label="User menu"
        >
          <span className="text-sm font-medium">{getInitials()}</span>
        </button>
      </LongHoverTooltip>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg py-2 z-50 border border-gray-200">
          {/* User Info Section */}
          <div className="px-4 py-3 border-b border-gray-200">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <span className="text-lg font-medium text-blue-600">{getInitials()}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {profile?.full_name || 'Loading...'}
                </p>
                <p className="text-sm text-gray-500 truncate">
                  {user.email}
                </p>
              </div>
            </div>
          </div>

          {/* Profile Details */}
          {profile && (
            <div className="px-4 py-3 space-y-3 border-b border-gray-200">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Role</p>
                <p className="mt-1 text-sm text-gray-900">{getRoleDisplay(profile.role)}</p>
              </div>

              {/* A user with no district at all (some teacher accounts) gets no
                  row rather than a labelled blank — same treatment as the site
                  row below. */}
              {profile.districtName && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">School District</p>
                  <p className="mt-1 text-sm text-gray-900">{profile.districtName}</p>
                </div>
              )}

              {/* District-wide roles have no site, and school_site is NOT NULL
                  so it arrives as an empty string — omit the row rather than
                  render a labelled blank. */}
              {profile.schoolSite && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">School Site</p>
                  <p className="mt-1 text-sm text-gray-900">{profile.schoolSite}</p>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="px-2 py-2 space-y-1">
            <button
              onClick={() => router.push('/dashboard/settings')}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Settings
            </button>
            <div className="border-t border-gray-200 my-1"></div>
            <button
              onClick={handleSignOut}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}