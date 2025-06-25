"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

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
  const supabase = createClientComponentClient();

  useEffect(() => {
    fetchProviderSchools();
  }, []);

  const fetchProviderSchools = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all schools for this provider
      const { data: schools } = await supabase
        .from('provider_schools')
        .select('*')
        .eq('provider_id', user.id)
        .order('is_primary', { ascending: false });

      if (schools && schools.length > 0) {
        setAvailableSchools(schools);

        // Set the primary school as current, or the first one
        const primarySchool = schools.find(s => s.is_primary) || schools[0];
        setCurrentSchool(primarySchool);
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