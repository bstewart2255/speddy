"use client"

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card'
import type { Database } from '../../src/types/database'

// Add this after the imports
const getRoleDisplayName = (role: string | null): string => {
  const roleMap: { [key: string]: string } = {
    'resource': 'Resource Specialist',
    'speech': 'Speech Therapist',
    'ot': 'Occupational Therapist',
    'counseling': 'Counselor',
    'specialist': 'Program Specialist',
    'sea': 'Special Education Assistant',
  };
  return roleMap[role || ''] || 'Provider';
};

type Profile = {
  id: string
  full_name: string | null
  role: string | null
  school_site: string | null
  school_district: string | null
}

export function TeamWidget() {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [teammates, setTeammates] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient<Database>()

  useEffect(() => {
    let isCancelled = false;

    async function fetchTeamData() {
      try {
        console.log('Fetching team data...');

        // Get current user
        const { data: { user } } = await supabase.auth.getUser()
        console.log('Current user:', user);

        if (!user || isCancelled) {
          console.log('No user found or cancelled');
          return
        }

        // Get current user's profile to know their school/district
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, role, school_site, school_district')
          .eq('id', user.id)
          .single()

        console.log('User profile:', userProfile);
        console.log('Profile error:', profileError);

        if (!userProfile || !userProfile.school_site || isCancelled) {
          console.log('No profile or school site found');
          return
        }

        setCurrentUser(userProfile)

        // Get all teammates (same school_site and school_district)
        const { data: teammatesData, error: teammatesError } = await supabase
          .from('profiles')
          .select('id, full_name, role, school_site, school_district')
          .eq('school_site', userProfile.school_site)
          .eq('school_district', userProfile.school_district)
          .neq('id', user.id) // Exclude current user
          .order('role')
          .order('full_name')

        console.log('Teammates data:', teammatesData);
        console.log('Teammates error:', teammatesError);

        if (!isCancelled && teammatesData) {
          setTeammates(teammatesData)
        }
      } catch (error) {
        console.error('Error fetching team data:', error)
      } finally {
        if (!isCancelled) {
          setLoading(false)
        }
      }
    }

    fetchTeamData()

    // Cleanup function
    return () => {
      isCancelled = true
    }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardBody className="pt-6">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </CardBody>
      </Card>
    )
  }

  if (!currentUser || !currentUser.school_site) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          My Team
        </CardTitle>
      </CardHeader>
      <CardBody>
        <h3 className="font-semibold text-lg mb-3">{currentUser.school_site}</h3>
        {currentUser.school_district && (
          <p className="text-sm text-gray-500 mb-3">{currentUser.school_district}</p>
        )}

        <ul className="space-y-2">
          {/* Show current user first */}
          <li className="text-sm">
            <span className="font-medium">
              {currentUser.full_name || 'You'}
            </span>
            <span className="text-muted-foreground"> - {getRoleDisplayName(currentUser.role)} (Me)</span>
          </li>
    
          {/* Show teammates */}
          {teammates.length > 0 ? (
            teammates.map((teammate) => (
              <li key={teammate.id} className="text-sm">
                <span className="font-medium">
                  {teammate.full_name || 'Unknown'}
                </span>
                <span className="text-muted-foreground"> - {getRoleDisplayName(teammate.role)}</span>
              </li>
            ))
          ) : (
            <li className="text-sm text-gray-500 italic">
              No other team members at this school yet
            </li>
          )}
        </ul>
      </CardBody>
    </Card>
  )
}