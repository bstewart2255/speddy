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
      school_site: string;
      school_district: string;
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

            // Get all schools for this provider
            const { data: providerSchools } = await supabase
              .from("provider_schools")
              .select("school_site, school_district")
              .eq("provider_id", user.id);

            let schoolsToCheck: School[] = [];
            
            if (!providerSchools || providerSchools.length === 0) {
              // Fallback to profile school if no provider_schools entries
              if (userProfile.school_site) {
                schoolsToCheck = [{
                  school_site: userProfile.school_site,
                  school_district: userProfile.school_district || ""
                }];
              }
            } else {
              schoolsToCheck = providerSchools;
            }
            
            setUserSchools(schoolsToCheck);

            // Fetch teammates for each school using the new comprehensive function
            const teamsMap = new Map<string, Profile[]>();

            for (const school of schoolsToCheck) {
              // Try using the new v2 function if user has school_id, otherwise fallback
              let allTeammates;
              
              if (userProfile.school_id) {
                // Use new hybrid matching function
                const { data } = await supabase
                  .rpc('find_all_team_members_v2', {
                    current_user_id: user.id
                  });
                allTeammates = data;
              } else {
                // Fallback to original function for unmigrated users
                const { data } = await supabase
                  .rpc('find_all_team_members', {
                    p_school_site: school.school_site,
                    p_school_district: school.school_district,
                    p_exclude_user_id: user.id
                  });
                allTeammates = data;
              }

              if (allTeammates) {
                // Sort teammates by role and name
                const sortedTeammates = allTeammates
                  .sort((a, b) => {
                    // Sort by role first, then by name
                    const roleOrder = ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea'];
                    const aRoleIndex = roleOrder.indexOf(a.role || '');
                    const bRoleIndex = roleOrder.indexOf(b.role || '');
                    
                    if (aRoleIndex !== bRoleIndex) {
                      return aRoleIndex - bRoleIndex;
                    }
                    
                    return (a.full_name || '').localeCompare(b.full_name || '');
                  });

                const schoolKey = `${school.school_district}-${school.school_site}`;
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
        const schoolKey = `${school.school_district}-${school.school_site}`;
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
              <h3 className="font-semibold text-lg mb-3">{school.school_site}</h3>
              {school.school_district && (
                <p className="text-sm text-gray-500 mb-3">{school.school_district}</p>
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
            const schoolKey = `${school.school_district}-${school.school_site}`;
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
                    Team: {school.school_site}
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  <p className="text-sm text-gray-500 mb-3">{school.school_district}</p>
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
