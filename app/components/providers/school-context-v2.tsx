"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getSchoolDisplayName, getSchoolKey } from '@/lib/school-helpers-v2';

export interface SchoolInfo {
  // Structured data only
  school_id: string;
  district_id: string;
  state_id: string;
  
  // Display data from joins
  school_name: string;
  district_name: string;
  state_name: string;
  state_abbreviation: string;
  
  // Computed display fields
  display_name: string;
  full_address: string;
  
  // Metadata
  is_primary: boolean;
  nces_id?: string;
}

interface SchoolContextType {
  currentSchool: SchoolInfo | null;
  availableSchools: SchoolInfo[];
  setCurrentSchool: (school: SchoolInfo) => void;
  loading: boolean;
  worksAtMultipleSchools: boolean;
  
  // Simplified methods
  getSchoolFilter: () => { school_id: string } | null;
  refreshSchoolData: () => Promise<void>;
  
  // Performance tracking
  queryPerformance: 'fast';
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [currentSchool, setCurrentSchoolState] = useState<SchoolInfo | null>(null);
  const [availableSchools, setAvailableSchools] = useState<SchoolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [worksAtMultipleSchools, setWorksAtMultipleSchools] = useState(false);
  const supabase = createClient();

  const fetchProviderSchools = useCallback(async () => {
    console.log('[SchoolContext] Fetching provider schools...');
    const startTime = performance.now();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[SchoolContext] No user found');
        setLoading(false);
        return;
      }
      console.log('[SchoolContext] User ID:', user.id);

      // Fetch profile with school details in a single optimized query
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select(`
          id,
          works_at_multiple_schools,
          school_id,
          district_id,
          state_id,
          schools!inner(
            id,
            name,
            nces_id,
            districts!inner(
              id,
              name,
              states!inner(
                id,
                name,
                abbreviation
              )
            )
          )
        `)
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('[SchoolContext] Error fetching profile:', profileError);
        setLoading(false);
        return;
      }

      if (!profile || !profile.school_id) {
        console.warn('[SchoolContext] User profile missing school_id');
        setLoading(false);
        return;
      }

      // Extract school info from the joined data
      const school = profile.schools as any;
      const district = school?.districts as any;
      const state = district?.states as any;

      const primarySchool: SchoolInfo = {
        school_id: profile.school_id,
        district_id: profile.district_id,
        state_id: profile.state_id,
        school_name: school?.name || '',
        district_name: district?.name || '',
        state_name: state?.name || '',
        state_abbreviation: state?.abbreviation || profile.state_id,
        display_name: `${school?.name} (${district?.name}, ${state?.abbreviation})`,
        full_address: `${school?.name}, ${district?.name}, ${state?.name}`,
        is_primary: true,
        nces_id: school?.nces_id,
      };

      // Check if user works at multiple schools
      let schools: SchoolInfo[] = [primarySchool];
      setWorksAtMultipleSchools(profile.works_at_multiple_schools || false);
      
      // If user works at multiple schools, fetch additional school associations
      if (profile.works_at_multiple_schools) {
        // For now, we'll use mock data for testing the UI
        // In production, this would fetch from a school_associations table
        console.log('[SchoolContext] User works at multiple schools - loading school associations');
        
        // Mock additional schools for testing
        const mockSchools: SchoolInfo[] = [
          primarySchool,
          {
            school_id: 'SCH002',
            district_id: profile.district_id,
            state_id: profile.state_id,
            school_name: 'Lincoln Elementary',
            district_name: district?.name || '',
            state_name: state?.name || '',
            state_abbreviation: state?.abbreviation || profile.state_id,
            display_name: `Lincoln Elementary (${district?.name}, ${state?.abbreviation})`,
            full_address: `Lincoln Elementary, ${district?.name}, ${state?.name}`,
            is_primary: false,
            nces_id: undefined,
          },
          {
            school_id: 'SCH003',
            district_id: profile.district_id,
            state_id: profile.state_id,
            school_name: 'Washington Middle School',
            district_name: district?.name || '',
            state_name: state?.name || '',
            state_abbreviation: state?.abbreviation || profile.state_id,
            display_name: `Washington Middle School (${district?.name}, ${state?.abbreviation})`,
            full_address: `Washington Middle School, ${district?.name}, ${state?.name}`,
            is_primary: false,
            nces_id: undefined,
          },
        ];
        schools = mockSchools;
      }
      
      setAvailableSchools(schools);

      // Check for cached selection
      const cachedSelection = localStorage.getItem('selectedSchool');
      if (cachedSelection) {
        try {
          const cached = JSON.parse(cachedSelection);
          if (cached.school_id === primarySchool.school_id) {
            setCurrentSchoolState(primarySchool);
          } else {
            setCurrentSchoolState(primarySchool);
          }
        } catch {
          setCurrentSchoolState(primarySchool);
        }
      } else {
        setCurrentSchoolState(primarySchool);
      }

      const endTime = performance.now();
      console.log(`[SchoolContext] School data loaded in ${Math.round(endTime - startTime)}ms`);
    } catch (error) {
      console.error('[SchoolContext] Unexpected error:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchProviderSchools();
  }, [fetchProviderSchools]);

  // Persist school selection
  useEffect(() => {
    if (currentSchool && !loading) {
      localStorage.setItem('selectedSchool', JSON.stringify({
        school_id: currentSchool.school_id,
        cached_at: new Date().toISOString(),
      }));
    }
  }, [currentSchool, loading]);

  const setCurrentSchool = useCallback((school: SchoolInfo) => {
    console.log('[SchoolContext] Setting current school:', school.school_id);
    setCurrentSchoolState(school);
  }, []);

  const getSchoolFilter = useCallback(() => {
    if (!currentSchool) return null;
    return { school_id: currentSchool.school_id };
  }, [currentSchool]);

  const refreshSchoolData = useCallback(async () => {
    await fetchProviderSchools();
  }, [fetchProviderSchools]);

  const contextValue = useMemo(
    () => ({
      currentSchool,
      availableSchools,
      setCurrentSchool,
      loading,
      worksAtMultipleSchools,
      getSchoolFilter,
      refreshSchoolData,
      queryPerformance: 'fast' as const,
    }),
    [currentSchool, availableSchools, setCurrentSchool, loading, worksAtMultipleSchools, getSchoolFilter, refreshSchoolData]
  );

  return (
    <SchoolContext.Provider value={contextValue}>
      {children}
    </SchoolContext.Provider>
  );
}

export function useSchool() {
  const context = useContext(SchoolContext);
  if (context === undefined) {
    throw new Error('useSchool must be used within a SchoolProvider');
  }
  return context;
}