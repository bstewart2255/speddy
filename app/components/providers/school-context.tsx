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
  const [schoolCache] = useState(new Map<string, any>());
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
      display_name: getSchoolDisplayName(school),
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

  useEffect(() => {
    fetchProviderSchools();
  }, []);

  // Persist school selection with migration status
  useEffect(() => {
    if (currentSchool && !loading) {
      const persistData = {
        ...currentSchool,
        cached_at: new Date().toISOString(),
      };
      localStorage.setItem('selectedSchool', JSON.stringify(persistData));
    }
  }, [currentSchool, loading]);

  const fetchProviderSchools = async () => {
    console.log('[SchoolContext] Fetching provider schools...');
    const startTime = performance.now();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[SchoolContext] No user found');
        return;
      }
      console.log('[SchoolContext] User ID:', user.id);

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

        if (schools && schools.length > 0) {
          // Enrich all schools in parallel for better performance
          const enrichedSchools = await Promise.all(
            schools.map(school => enrichSchoolData(school))
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

          // Check for saved school preference with migration awareness
          const savedSchool = localStorage.getItem('selectedSchool');
          let schoolToSet: SchoolInfo | undefined = undefined;

          if (savedSchool) {
            try {
              const parsedSchool = JSON.parse(savedSchool);
              
              // Try to match by school_id first (most reliable)
              if (parsedSchool.school_id) {
                schoolToSet = enrichedSchools.find(s => s.school_id === parsedSchool.school_id);
              }
              
              // Fallback to text matching
              if (!schoolToSet) {
                schoolToSet = enrichedSchools.find(s => 
                  s.school_site === parsedSchool.school_site && 
                  s.school_district === parsedSchool.school_district
                );
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
  };
  
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
  }, [schoolCache]);

  return (
    <SchoolContext.Provider value={{ 
      currentSchool, 
      availableSchools, 
      setCurrentSchool, 
      loading,
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