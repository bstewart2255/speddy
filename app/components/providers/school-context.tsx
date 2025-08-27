"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useMemo, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { buildSchoolFilter, getSchoolDisplayName, isUserMigrated, getSchoolKey } from '@/lib/school-helpers';

export interface SchoolInfo {
  // Structured data (preferred)
  school_id?: string | null;
  district_id?: string | null;
  state_id?: string | null;
  
  // Legacy text data (fallback)
  school_site: string;
  school_district: string;
  
  // Combined display data
  display_name: string;
  full_address?: string;
  is_migrated: boolean;
  is_primary: boolean;
  
  // Performance hints
  query_performance: 'fast' | 'normal';
  
  // Additional metadata
  school_details?: {
    name?: string;
    district_name?: string;
    state_name?: string;
    nces_id?: string;
  };
}

interface SchoolContextType {
  currentSchool: SchoolInfo | null;
  availableSchools: SchoolInfo[];
  setCurrentSchool: (school: SchoolInfo) => void;
  loading: boolean;
  worksAtMultipleSchools: boolean;
  
  // Enhanced methods
  getSchoolFilter: () => any;
  isCurrentSchoolMigrated: () => boolean;
  refreshSchoolData: () => Promise<void>;
  
  // Cache management
  schoolCache: Map<string, any>;
}

const SchoolContext = createContext<SchoolContextType | undefined>(undefined);

export function SchoolProvider({ children }: { children: ReactNode }) {
  const [currentSchool, setCurrentSchoolState] = useState<SchoolInfo | null>(null);
  const [availableSchools, setAvailableSchools] = useState<SchoolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [worksAtMultipleSchools, setWorksAtMultipleSchools] = useState(false);
  const [schoolCache] = useState(new Map<string, any>());
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  // Enhanced school enrichment function
  const enrichSchoolData = useCallback(async (school: any): Promise<SchoolInfo> => {
    const cacheKey = getSchoolKey(school);
    
    // Check cache first
    if (schoolCache.has(cacheKey)) {
      return schoolCache.get(cacheKey);
    }
    
    let enrichedSchool: SchoolInfo = {
      ...school,
      display_name: school.display_name || getSchoolDisplayName(school),
      is_migrated: isUserMigrated(school),
      query_performance: school.school_id ? 'fast' : 'normal',
    };
    
    // Fetch additional school details if we have a school_id
    if (school.school_id) {
      try {
        const { data: schoolDetails } = await supabase
          .from('schools')
          .select(`
            name,
            nces_id,
            districts!inner(
              name,
              states!inner(
                name,
                abbreviation
              )
            )
          `)
          .eq('id', school.school_id)
          .single();
        
        if (schoolDetails) {
          const districts = schoolDetails.districts as any;
          enrichedSchool.school_details = {
            name: schoolDetails.name,
            district_name: districts?.name,
            state_name: districts?.states?.name,
            nces_id: schoolDetails.nces_id,
          };
          
          // Update display name with richer data
          enrichedSchool.display_name = `${schoolDetails.name} (${districts?.name}, ${districts?.states?.abbreviation})`;
          enrichedSchool.full_address = `${schoolDetails.name}, ${districts?.name}, ${districts?.states?.name}`;
        }
      } catch (error) {
        console.warn('[SchoolContext] Could not fetch additional school details:', error);
      }
    }
    
    // Cache the enriched data
    schoolCache.set(cacheKey, enrichedSchool);
    
    return enrichedSchool;
  }, [supabase, schoolCache]);

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
      setUserId(user.id);
      
      // Clean up old global localStorage key if it exists
      if (localStorage.getItem('selectedSchool')) {
        localStorage.removeItem('selectedSchool');
        console.log('[SchoolContext] Cleaned up old global selectedSchool key');
      }

      // Fetch profile with migration status
      console.log('[SchoolContext] Fetching profile for user:', user.id);
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('works_at_multiple_schools, school_site, school_district, school_id, district_id, state_id')
        .eq('id', user.id)
        .single();

      if (profileError) {
        console.error('[SchoolContext] Error fetching profile:', {
          error: profileError,
          message: profileError.message,
          code: profileError.code,
          details: profileError.details,
          hint: profileError.hint,
          status: (profileError as any).status
        });
      }

      if (!profile) {
        console.log('[SchoolContext] No profile found');
        return;
      }

      const isMigrated = !!profile.school_id;
      console.log('[SchoolContext] Profile (migrated:', isMigrated, '):', profile);

      // Set the worksAtMultipleSchools state
      setWorksAtMultipleSchools(profile.works_at_multiple_schools || false);

      // If user only works at one school, use their profile school
      if (!profile.works_at_multiple_schools) {
        const singleSchool = await enrichSchoolData({
          school_site: profile.school_site,
          school_district: profile.school_district,
          is_primary: true,
          school_id: profile.school_id,
          district_id: profile.district_id,
          state_id: profile.state_id
        });
        
        console.log('[SchoolContext] Single school mode, enriched:', singleSchool);
        setAvailableSchools([singleSchool]);
        setCurrentSchoolState(singleSchool);
      } else {
        // User works at multiple schools, fetch from provider_schools
        const { data: schools } = await supabase
          .from('provider_schools')
          .select('*')
          .eq('provider_id', user.id)
          .order('is_primary', { ascending: false });

        // If no schools in provider_schools table, create mock data for testing
        let schoolsToEnrich = schools;
        if (!schools || schools.length === 0) {
          console.log('[SchoolContext] No schools in provider_schools, using mock data for testing');
          schoolsToEnrich = [
            {
              school_site: profile.school_site,
              school_district: profile.school_district,
              is_primary: true,
              school_id: profile.school_id,
              district_id: profile.district_id,
              state_id: profile.state_id,
              display_name: `${profile.school_site} (${profile.school_district})`
            },
            {
              school_site: 'Lincoln Elementary',
              school_district: profile.school_district,
              is_primary: false,
              school_id: 'MOCK_SCH_002',
              district_id: profile.district_id,
              state_id: profile.state_id,
              display_name: `Lincoln Elementary (${profile.school_district})`
            },
            {
              school_site: 'Washington Middle School',
              school_district: profile.school_district,
              is_primary: false,
              school_id: 'MOCK_SCH_003',
              district_id: profile.district_id,
              state_id: profile.state_id,
              display_name: `Washington Middle School (${profile.school_district})`
            }
          ];
        }

        if (schoolsToEnrich && schoolsToEnrich.length > 0) {
          // Enrich all schools in parallel for better performance
          const enrichedSchools = await Promise.all(
            schoolsToEnrich.map(school => enrichSchoolData(school))
          );
          
          // Sort enriched schools: migrated first, then primary
          enrichedSchools.sort((a, b) => {
            if (a.is_migrated !== b.is_migrated) {
              return b.is_migrated ? 1 : -1;
            }
            if (a.is_primary !== b.is_primary) {
              return b.is_primary ? 1 : -1;
            }
            return 0;
          });
          
          setAvailableSchools(enrichedSchools);

          // Check for saved school preference with user-scoped key
          const savedSchoolData = localStorage.getItem(`selectedSchool:${user.id}`);
          let schoolToSet: SchoolInfo | undefined = undefined;

          if (savedSchoolData) {
            try {
              const saved = JSON.parse(savedSchoolData);
              
              // Only use the school_id from saved data to find the actual school
              if (saved.school_id) {
                schoolToSet = enrichedSchools.find(s => s.school_id === saved.school_id);
              }
            } catch (e) {
              console.error('Error parsing saved school:', e);
            }
          }

          // Use the best available school as fallback
          if (!schoolToSet) {
            schoolToSet = enrichedSchools.find(s => s.is_primary) || enrichedSchools[0];
          }

          setCurrentSchoolState(schoolToSet || null);
        }
      }
      
      const endTime = performance.now();
      console.log(`[SchoolContext] School data loaded in ${Math.round(endTime - startTime)}ms`);
    } catch (error) {
      console.error('Error fetching provider schools:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, enrichSchoolData]);
  
  // Enhanced setCurrentSchool with cache warming
  const setCurrentSchool = useCallback(async (school: SchoolInfo) => {
    // If the school isn't fully enriched, enrich it
    if (!school.display_name || !school.query_performance) {
      const enriched = await enrichSchoolData(school);
      setCurrentSchoolState(enriched);
    } else {
      setCurrentSchoolState(school);
    }
  }, [enrichSchoolData]);
  
  // Get optimized filter for current school
  const getSchoolFilter = useCallback(() => {
    if (!currentSchool) return {};
    return buildSchoolFilter({}, currentSchool);
  }, [currentSchool]);
  
  // Check if current school is migrated
  const isCurrentSchoolMigrated = useCallback(() => {
    return currentSchool?.is_migrated || false;
  }, [currentSchool]);
  
  // Refresh school data (useful after migrations)
  const refreshSchoolData = useCallback(async () => {
    schoolCache.clear();
    await fetchProviderSchools();
  }, [schoolCache, fetchProviderSchools]);

  // Call fetchProviderSchools on mount
  useEffect(() => {
    fetchProviderSchools();
  }, [fetchProviderSchools]);

  // Persist school selection with user-scoped key and minimal data
  useEffect(() => {
    if (currentSchool && !loading && userId) {
      // Store only minimal identifiers to prevent PII leakage
      const minimalData = {
        school_id: currentSchool.school_id || null,
        cached_at: new Date().toISOString(),
      };
      localStorage.setItem(`selectedSchool:${userId}`, JSON.stringify(minimalData));
    }
  }, [currentSchool, loading, userId]);

  return (
    <SchoolContext.Provider value={{ 
      currentSchool, 
      availableSchools, 
      setCurrentSchool, 
      loading,
      worksAtMultipleSchools,
      getSchoolFilter,
      isCurrentSchoolMigrated,
      refreshSchoolData,
      schoolCache
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