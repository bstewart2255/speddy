"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';

interface School {
  school_site: string;
  school_district: string;
  is_primary: boolean;
}

interface SchoolContextType {
  currentSchool: School | null;
  availableSchools: School[];
  setCurrentSchool: (school: School) => void;
  loading: boolean;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [availableSchools, setAvailableSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchProviderSchools();
  }, []);

  // Add this new effect to persist school selection
  useEffect(() => {
    if (currentSchool && !loading) {
      localStorage.setItem('selectedSchool', JSON.stringify(currentSchool));
    }
  }, [currentSchool, loading]);

  const fetchProviderSchools = async () => {
    console.log('[SchoolContext] Fetching provider schools...');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[SchoolContext] No user found');
        return;
      }
      console.log('[SchoolContext] User ID:', user.id);

      // First, check if user works at multiple schools
      const { data: profile } = await supabase
        .from('profiles')
        .select('works_at_multiple_schools, school_site, school_district')
        .eq('id', user.id)
        .single();

      if (!profile) {
        console.log('[SchoolContext] No profile found');
        return;
      }

      console.log('[SchoolContext] Profile:', profile);

      // If user only works at one school, use their profile school
      if (!profile.works_at_multiple_schools) {
        const singleSchool = {
          school_site: profile.school_site,
          school_district: profile.school_district,
          is_primary: true
        };
        console.log('[SchoolContext] Single school mode, setting:', singleSchool);
        setAvailableSchools([singleSchool]);
        setCurrentSchool(singleSchool);
      } else {
        // User works at multiple schools, fetch from provider_schools
        const { data: schools } = await supabase
          .from('provider_schools')
          .select('*')
          .eq('provider_id', user.id)
          .order('is_primary', { ascending: false });

        if (schools && schools.length > 0) {
          setAvailableSchools(schools);

          // Check for saved school preference BEFORE setting any school
          const savedSchool = localStorage.getItem('selectedSchool');
          let schoolToSet = null;

          if (savedSchool) {
            try {
              const parsedSchool = JSON.parse(savedSchool);
              // Find the matching school from the fetched schools
              const matchingSchool = schools.find(s => 
                s.school_site === parsedSchool.school_site && 
                s.school_district === parsedSchool.school_district
              );

              if (matchingSchool) {
                schoolToSet = matchingSchool;
              }
            } catch (e) {
              console.error('Error parsing saved school:', e);
            }
          }

          // Only use primary as fallback if no valid saved school
          if (!schoolToSet) {
            schoolToSet = schools.find(s => s.is_primary) || schools[0];
          }

          setCurrentSchool(schoolToSet);
        }
      }
    } catch (error) {
      console.error('Error fetching provider schools:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SchoolContext.Provider value={{ 
      currentSchool, 
      availableSchools, 
      setCurrentSchool, 
      loading 
    }}>
      {children}
    </SchoolContext.Provider>
  );
}

export const useSchool = () => {
  const context = useContext(SchoolContext);
  if (!context) {
    throw new Error('useSchool must be used within SchoolProvider');
  }
  return context;
};