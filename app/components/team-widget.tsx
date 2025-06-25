    "use client";

    import { useEffect, useState } from "react";
    import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
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
      const supabase = createClientComponentClient<Database>();

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

            // Get current user's profile
            const { data: userProfile } = await supabase
              .from("profiles")
              .select("id, full_name, role, school_site, school_district")
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

            if (!providerSchools || providerSchools.length === 0) {
              // Fallback to profile school if no provider_schools entries
              if (userProfile.school_site) {
                setUserSchools([{
                  school_site: userProfile.school_site,
                  school_district: userProfile.school_district || ""
                }]);
              }
            } else {
              setUserSchools(providerSchools);
            }

            // Fetch teammates for each school
            const teamsMap = new Map<string, Profile[]>();

            for (const school of providerSchools || []) {
              const { data: teammates } = await supabase
                .from("profiles")
                .select("id, full_name, role, school_site, school_district")
                .eq("school_site", school.school_site)
                .eq("school_district", school.school_district)
                .neq("id", user.id)
                .order("role")
                .order("full_name");

              if (teammates) {
                const schoolKey = `${school.school_district}-${school.school_site}`;
                teamsMap.set(schoolKey, teammates);
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