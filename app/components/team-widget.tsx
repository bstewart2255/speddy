"use client"

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Card, CardBody, CardHeader, CardTitle } from '../components/ui/card'
// import { Users } from 'lucide-react' --> Need to update to React 19 first
import type { Database } from '../../src/types/database'

type TeamMemberWithProfile = Database['public']['Tables']['team_members']['Row'] & {
  profiles: {
    full_name: string | null
  }
}

type Team = Database['public']['Tables']['teams']['Row']

export function TeamWidget() {
  const [team, setTeam] = useState<Team | null>(null)
  const [teamMembers, setTeamMembers] = useState<TeamMemberWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClientComponentClient<Database>()
  const [renderKey, setRenderKey] = useState(0)
  
  useEffect(() => {
    let isCancelled = false;

    async function fetchTeamData() {
      try {
        console.log('Fetching team data...');
        const { data: { user } } = await supabase.auth.getUser()
        console.log('Current user:', user);
        if (!user || isCancelled) {
          console.log('No user found or cancelled');
          return
        }

        // Get user's team
        const { data: memberData, error: memberError } = await supabase
          .from('team_members')
          .select('team_id')
          .eq('user_id', user.id)
          .single()

        console.log('Member data:', memberData);
        console.log('Member error:', memberError);

        if (memberData && !isCancelled) {
          // Get team details
          const { data: teamData, error: teamError } = await supabase
            .from('teams')
            .select('*')
            .eq('id', memberData.team_id)
            .single()

          console.log('Team data:', teamData);
          console.log('Team error:', teamError);

          // Get all team members
          const { data: membersData, error: membersError } = await supabase
            .from('team_members')
            .select('*')
            .eq('team_id', memberData.team_id)

          console.log('Members data:', membersData);
          console.log('Members error:', membersError);

          // Get profiles for all team members
          if (membersData && membersData.length > 0 && !isCancelled) {
            const userIds = membersData.map(m => m.user_id)
            console.log('User IDs to fetch:', userIds);

            const { data: profilesData, error: profilesError } = await supabase
              .from('profiles')
              .select('id, full_name')
              .in('id', userIds)

            console.log('Profiles data:', profilesData);
            console.log('Profiles error:', profilesError);

            // Merge the data
            const membersWithProfiles = membersData.map(member => {
              const profile = profilesData?.find(p => p.id === member.user_id);
              console.log(`Matching profile for ${member.user_id}:`, profile);
              return {
                ...member,
                profiles: profile || { full_name: null }
              };
            });

            console.log('Final members with profiles:', membersWithProfiles);

            if (!isCancelled) {
              setTeamMembers([...membersWithProfiles] as any)
            }
          } else if (!isCancelled) {
            setTeamMembers([])
          }

          if (teamData && !isCancelled) setTeam(teamData)
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

  if (!team || teamMembers.length === 0) {
    return null
  }

  console.log('Rendering team members:', teamMembers);

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
        <h3 className="font-semibold text-lg mb-3">{team.school_name}</h3>
        <ul className="space-y-2">
          {teamMembers.map((member) => {
            console.log('Rendering member:', member, 'full_name:', member.profiles?.full_name);
            return (
              <li key={member.id} className="text-sm">
                <span className="font-medium">
                  {member.profiles?.full_name || 'Unknown'}
                </span>
                <span className="text-muted-foreground"> - {member.role}</span>
              </li>
            );
          })}
        </ul>
      </CardBody>
    </Card>
  )
}