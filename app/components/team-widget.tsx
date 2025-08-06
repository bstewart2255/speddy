    "use client";

    import { useEffect, useState } from "react";
    import { createClient } from '@/lib/supabase/client';
    import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/card";
    import type { Database } from "../../src/types/database";

    const getRoleDisplayName = (role: string | null): string => {
      const roleMap: { [key: string]: string } = {
        resource: "Resource Specialist",
        speech: "Speech Therapist",
        ot: "Occupational Therapist",
        counseling: "Counselor",
        specialist: "Program Specialist",
        sea: "Special Education Assistant",
      };
      return roleMap[role || ""] || "Provider";
    };

    type Profile = {
      id: string;
      full_name: string | null;
      role: string | null;
      school_site: string | null;
      school_district: string | null;
      school_id?: string | null;
      district_id?: string | null;
      state_id?: string | null;
      matching_method?: string;
    };

    type School = {
      school_id: string;
      school_name: string;
      district_name: string;
      is_primary: boolean;
    };

    export function TeamWidget() {
      const [currentUser, setCurrentUser] = useState<Profile | null>(null);
      const [teamsBySchool, setTeamsBySchool] = useState<Map<string, Profile[]>>(new Map());
      const [userSchools, setUserSchools] = useState<School[]>([]);
      const [loading, setLoading] = useState(true);
      const supabase = createClient<Database>();

      useEffect(() => {
        let isCancelled = false;

        async function fetchTeamData() {
          try {
            const {
              data: { user },
            } = await supabase.auth.getUser();

            if (!user || isCancelled) {
              return;
            }

            // Get current user's profile including new school IDs
            const { data: userProfile } = await supabase
              .from("profiles")
              .select("id, full_name, role, school_site, school_district, school_id, district_id, state_id")
              .eq("id", user.id)
              .single();

            if (!userProfile || isCancelled) {
              return;
            }

            setCurrentUser(userProfile);

            // Get all schools for this provider using the new multi-school function
            const { data: userSchoolsData } = await supabase
              .rpc('get_user_schools', {
                user_id: user.id
              });

            let schoolsToCheck: School[] = [];
            
            if (userSchoolsData && userSchoolsData.length > 0) {
              // Map the database response to our School type
              schoolsToCheck = userSchoolsData.map((school: any) => ({
                school_id: school.school_id,
                school_name: school.school_name,
                district_name: school.district_name || '',
                is_primary: school.is_primary || false
              }));
            } else if (userProfile.school_site) {
              // Fallback to profile school if no schools found
              schoolsToCheck = [{
                school_id: userProfile.school_id || '',
                school_name: userProfile.school_site,
                district_name: userProfile.school_district || '',
                is_primary: true
              }];
            }
            
            setUserSchools(schoolsToCheck);

            // Fetch teammates for each school using the multi-school function
            const teamsMap = new Map<string, Profile[]>();

            for (const school of schoolsToCheck) {
              // Use the multi-school aware function for each school
              const { data: allTeammates } = await supabase
                .rpc('find_all_team_members_multi_school', {
                  current_user_id: user.id,
                  target_school_id: school.school_id
                });

              if (allTeammates) {
                // Sort teammates by role and name
                const sortedTeammates = allTeammates
                  .sort((a: any, b: any) => {
                    // Sort by role first, then by name
                    const roleOrder = ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea'];
                    const aRoleIndex = roleOrder.indexOf(a.role || '');
                    const bRoleIndex = roleOrder.indexOf(b.role || '');
                    
                    if (aRoleIndex !== bRoleIndex) {
                      return aRoleIndex - bRoleIndex;
                    }
                    
                    return (a.full_name || '').localeCompare(b.full_name || '');
                  });

                const schoolKey = school.school_id || `${school.district_name}-${school.school_name}`;
                teamsMap.set(schoolKey, sortedTeammates);
              }
            }

            if (!isCancelled) {
              setTeamsBySchool(teamsMap);
            }
          } catch (error) {
            console.error("Error fetching team data:", error);
          } finally {
            if (!isCancelled) {
              setLoading(false);
            }
          }
        }

        fetchTeamData();

        return () => {
          isCancelled = true;
        };
      }, []);

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
        );
      }

      if (!currentUser || userSchools.length === 0) {
        return null;
      }

      // If only one school, show the original single card
      if (userSchools.length === 1) {
        const school = userSchools[0];
        const schoolKey = school.school_id || `${school.district_name}-${school.school_name}`;
        const teammates = teamsBySchool.get(schoolKey) || [];

        return (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
                My Team
              </CardTitle>
            </CardHeader>
            <CardBody>
              <h3 className="font-semibold text-lg mb-3">{school.school_name}</h3>
              {school.district_name && (
                <p className="text-sm text-gray-500 mb-3">{school.district_name}</p>
              )}
              <TeamMembersList 
                currentUser={currentUser} 
                teammates={teammates} 
              />
            </CardBody>
          </Card>
        );
      }

      // Multiple schools - show a card for each
      return (
        <>
          {userSchools.map((school) => {
            const schoolKey = school.school_id || `${school.district_name}-${school.school_name}`;
            const teammates = teamsBySchool.get(schoolKey) || [];

            return (
              <Card key={schoolKey}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <svg
                      className="h-5 w-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                      />
                    </svg>
                    Team: {school.school_name}
                    {school.is_primary && (
                      <span className="text-xs ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        Primary
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="text-sm text-gray-500 mb-3">{school.district_name}</p>
                  <TeamMembersList 
                    currentUser={currentUser} 
                    teammates={teammates} 
                  />
                </CardBody>
              </Card>
            );
          })}
        </>
      );
    }

    // Helper component to render team members list
    function TeamMembersList({ 
      currentUser, 
      teammates 
    }: { 
      currentUser: Profile; 
      teammates: Profile[] 
    }) {
      return (
        <ul className="space-y-2">
          {/* Show current user first */}
          <li className="text-sm">
            <span className="font-medium">
              {currentUser.full_name || "You"}
            </span>
            <span className="text-muted-foreground">
              {" "}
              - {getRoleDisplayName(currentUser.role)} (Me)
            </span>
          </li>

          {/* Show teammates */}
          {teammates.length > 0 ? (
            teammates.map((teammate) => (
              <li key={teammate.id} className="text-sm">
                <span className="font-medium">
                  {teammate.full_name || "Unknown"}
                </span>
                <span className="text-muted-foreground">
                  {" "}
                  - {getRoleDisplayName(teammate.role)}
                  {teammate.matching_method && teammate.matching_method !== 'exact_id' && (
                    <span className="text-xs ml-1 text-orange-500" title="Matched using text-based fuzzy matching">
                      (pending migration)
                    </span>
                  )}
                </span>
              </li>
            ))
          ) : (
            <li className="text-sm text-gray-500 italic">
              No other team members at this school yet
            </li>
          )}
        </ul>
      );
    }
