'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';
import { useRouter } from 'next/navigation';
import { Gift, Copy } from 'lucide-react';

interface Profile {
  full_name: string;
  role: string;
  school_district: string;
  school_site: string;
  email: string;
}

interface ReferralInfo {
  code: string;
  active_referrals: number;
}

export default function UserProfileDropdown({ user }: { user: User }) {
  const [isOpen, setIsOpen] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [referralInfo, setReferralInfo] = useState<ReferralInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const router = useRouter();

  // Fetch user profile data
  useEffect(() => {
    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (data && !error) {
        setProfile(data);
        
        // Fetch referral info for teacher roles
        const teacherRoles = ['resource', 'speech', 'ot', 'counseling', 'specialist'];
        if (teacherRoles.includes(data.role)) {
          fetchReferralInfo();
        }
      }
    };

    const fetchReferralInfo = async () => {
      try {
        // Get referral code
        const { data: codeData } = await supabase
          .from('referral_codes')
          .select('code')
          .eq('user_id', user.id)
          .single();

        if (codeData) {
          // Get active referrals count
          const { data: referralsData } = await supabase
            .from('referral_relationships')
            .select('*')
            .eq('referrer_id', user.id);

          setReferralInfo({
            code: codeData.code,
            active_referrals: referralsData?.length || 0
          });
        }
      } catch (error) {
        console.error('Error fetching referral info:', error);
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

  const handleCopyCode = async () => {
    if (!referralInfo?.code) return;
    
    try {
      await navigator.clipboard.writeText(referralInfo.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
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
      'sea': 'Special Education Assistant'
    };
    return roleMap[role] || role;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Profile Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        aria-label="User menu"
      >
        <span className="text-sm font-medium">{getInitials()}</span>
      </button>

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
                {profile.role === 'sea' && (
                  <p className="mt-1 text-xs text-green-600">Free access - no payment required</p>
                )}
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">School District</p>
                <p className="mt-1 text-sm text-gray-900">{profile.school_district}</p>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">School Site</p>
                <p className="mt-1 text-sm text-gray-900">{profile.school_site}</p>
              </div>
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
            {/* Only show billing link for non-SEA users */}
            {profile && profile.role !== 'sea' && (
              <button
                onClick={() => router.push('/billing')}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
              >
                Billing & Subscription
              </button>
            )}
            
            {/* Referral Code Section - Only for teachers */}
            {referralInfo && (
              <>
                <div className="border-t border-gray-200 my-1"></div>
                <div className="px-3 py-3 bg-blue-50 rounded-md mx-2">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Gift className="w-4 h-4 text-blue-600" />
                      <span className="text-xs font-medium text-gray-700">Referral Code</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-sm text-gray-900">{referralInfo.code}</span>
                      <button
                        onClick={handleCopyCode}
                        className="text-gray-500 hover:text-gray-700 p-1 rounded hover:bg-blue-100 transition-colors"
                        title="Copy code"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      {copied && (
                        <span className="text-xs text-green-600 ml-1">Copied!</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-600">
                      {referralInfo.active_referrals} active referral{referralInfo.active_referrals !== 1 ? 's' : ''}
                    </span>
                    <button
                      onClick={() => router.push('/billing')}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                    >
                      View details
                    </button>
                  </div>
                </div>
              </>
            )}
            
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