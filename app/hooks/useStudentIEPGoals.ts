'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { classifyIEPGoalsBySubject, hasGoalsForSubject } from '@/lib/utils/subject-classifier';

interface StudentIEPData {
  studentId: string;
  iepGoals: string[] | null;
  hasMathGoals: boolean;
  hasELAGoals: boolean;
  hasUnclassifiedGoals: boolean;
}

export function useStudentIEPGoals(studentIds: string[]) {
  const [iepData, setIepData] = useState<Map<string, StudentIEPData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Create a stable string representation of studentIds
  const studentIdsKey = JSON.stringify(studentIds);

  useEffect(() => {
    if (studentIds.length === 0) {
      setIepData(new Map());
      return;
    }

    async function fetchIEPGoalsInner() {
      setLoading(true);
      setError(null);

      try {
        const supabase = createClient();
        const newData = new Map<string, StudentIEPData>();

        // Fetch student details including IEP goals
        const { data, error: fetchError } = await supabase
          .from('student_details')
          .select('student_id, iep_goals')
          .in('student_id', studentIds);

        if (fetchError) {
          throw fetchError;
        }

        // Process each student's IEP goals
        for (const studentId of studentIds) {
          const studentDetail = data?.find(d => d.student_id === studentId);
          const iepGoals = studentDetail?.iep_goals || null;
          const classification = classifyIEPGoalsBySubject(iepGoals);

          newData.set(studentId, {
            studentId,
            iepGoals,
            hasMathGoals: classification.hasMathGoals,
            hasELAGoals: classification.hasELAGoals,
            hasUnclassifiedGoals: classification.unclassifiedGoals.length > 0
          });
        }

        setIepData(newData);
      } catch (err: any) {
        console.error('Error fetching IEP goals:', err);
        setError(err.message || 'Failed to fetch IEP goals');
      } finally {
        setLoading(false);
      }
    }

    fetchIEPGoalsInner();
  }, [studentIds, studentIdsKey]);


  /**
   * Check if any of the selected students have goals for a specific subject
   */
  function hasAnyStudentGoalsForSubject(subject: string): boolean {
    for (const data of iepData.values()) {
      if (hasGoalsForSubject(data.iepGoals, subject)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get students who have goals for a specific subject
   */
  function getStudentsWithSubjectGoals(subject: string): string[] {
    const studentsWithGoals: string[] = [];
    
    for (const [studentId, data] of iepData.entries()) {
      if (hasGoalsForSubject(data.iepGoals, subject)) {
        studentsWithGoals.push(studentId);
      }
    }
    
    return studentsWithGoals;
  }

  /**
   * Get students who don't have goals for a specific subject
   */
  function getStudentsWithoutSubjectGoals(subject: string): string[] {
    const studentsWithoutGoals: string[] = [];
    
    for (const [studentId, data] of iepData.entries()) {
      if (!hasGoalsForSubject(data.iepGoals, subject)) {
        studentsWithoutGoals.push(studentId);
      }
    }
    
    return studentsWithoutGoals;
  }

  return {
    iepData,
    loading,
    error,
    hasAnyStudentGoalsForSubject,
    getStudentsWithSubjectGoals,
    getStudentsWithoutSubjectGoals
  };
}