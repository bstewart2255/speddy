'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/app/components/ui/card';
import { fetchTeamMembers } from '@/lib/school-helpers-v2';
import { useSchool } from '@/app/components/providers/school-context-v2';

interface TeamMember {
  id: string;
  email: string;
  display_name?: string;
  full_name?: string;
  role: string;
  avatar_url?: string;
  grade_level?: string;
  subject?: string;
  bio?: string;
}

export default function TeamWidget() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();
  const { currentSchool } = useSchool();

  const loadTeamMembers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('User not authenticated');
        return;
      }

      console.log('[TeamWidget] Fetching team members for school:', currentSchool?.school_id);
      const startTime = performance.now();
      
      const members = await fetchTeamMembers(supabase, user.id);
      
      const endTime = performance.now();
      console.log(`[TeamWidget] Loaded ${members.length} team members in ${Math.round(endTime - startTime)}ms`);
      
      setTeamMembers(members);
    } catch (err) {
      console.error('[TeamWidget] Error loading team members:', err);
      setError('Failed to load team members');
    } finally {
      setLoading(false);
    }
  }, [currentSchool, supabase]);

  useEffect(() => {
    if (currentSchool) {
      loadTeamMembers();
    }
  }, [currentSchool, loadTeamMembers]);

  const getRoleLabel = (role: string): string => {
    const roleMap: Record<string, string> = {
      'resource': 'Resource Specialist',
      'speech': 'Speech Therapist',
      'ot': 'Occupational Therapist',
      'counseling': 'Counselor',
      'specialist': 'Specialist',
      'sea': 'Special Education Assistant'
    };
    return roleMap[role] || role;
  };

  const getRoleColor = (role: string): string => {
    const colorMap: Record<string, string> = {
      'resource': 'bg-blue-100 text-blue-800',
      'speech': 'bg-green-100 text-green-800',
      'ot': 'bg-purple-100 text-purple-800',
      'counseling': 'bg-yellow-100 text-yellow-800',
      'specialist': 'bg-gray-100 text-gray-800',
      'sea': 'bg-pink-100 text-pink-800'
    };
    return colorMap[role] || 'bg-gray-100 text-gray-800';
  };

  const getInitials = (member: TeamMember): string => {
    const name = member.display_name || member.full_name || member.email;
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  if (loading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2 mb-1"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-6 border-red-200 bg-red-50">
        <p className="text-red-600">{error}</p>
      </Card>
    );
  }

  if (!currentSchool) {
    return (
      <Card className="p-6">
        <p className="text-gray-500">No school selected</p>
      </Card>
    );
  }

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">My Team</h3>
        <p className="text-sm text-gray-500">{currentSchool.display_name}</p>
      </div>

      {teamMembers.length === 0 ? (
        <p className="text-gray-500 text-sm">No team members found at your school</p>
      ) : (
        <div className="space-y-3">
          {teamMembers.map(member => (
            <div key={member.id} className="flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors">
              {member.avatar_url ? (
                <Image
                  src={member.avatar_url}
                  alt={member.display_name || member.email}
                  width={40}
                  height={40}
                  className="rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <span className="text-indigo-600 font-medium text-sm">
                    {getInitials(member)}
                  </span>
                </div>
              )}
              
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {member.display_name || member.full_name || member.email}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getRoleColor(member.role)}`}>
                    {getRoleLabel(member.role)}
                  </span>
                  {member.grade_level && (
                    <span className="text-xs text-gray-500">
                      Grade {member.grade_level}
                    </span>
                  )}
                  {member.subject && (
                    <span className="text-xs text-gray-500">
                      {member.subject}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          {teamMembers.length} team {teamMembers.length === 1 ? 'member' : 'members'} • 
          <span className="text-green-600 ml-1">⚡ Fast query</span>
        </p>
      </div>
    </Card>
  );
}