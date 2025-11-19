'use client';

import React, { useMemo } from 'react';
import { GRADE_COLOR_MAP } from '@/lib/scheduling/constants';
import { formatTeacherName } from '@/lib/utils/teacher-utils';
import type {
  BellSchedule,
  ScheduleSession,
  SchoolHour,
  SpecialActivity,
  Student,
} from '@/src/types/database';
import type { Teacher } from '../types/teacher';

interface VisualAvailabilityLayerProps {
  day: number;
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  schoolHours: SchoolHour[];
  sessions: ScheduleSession[];
  students: Student[];
  teachers: Teacher[];
  filters: {
    bellScheduleGrade: string | null;
    specialActivityTeacher: string | null; // teacher_id
  };
  gridConfig: {
    startHour: number;
    endHour: number;
    pixelsPerHour: number;
  };
}

export function VisualAvailabilityLayer({
  day,
  bellSchedules,
  specialActivities,
  schoolHours,
  sessions,
  students,
  teachers,
  filters,
  gridConfig,
}: VisualAvailabilityLayerProps) {
  // Calculate availability bands based on filters
  const availabilityBands = useMemo(() => {
    const bands: Array<{
      startMin: number;
      endMin: number;
      color: string;
      type: 'bell' | 'activity';
      opacity: number;
    }> = [];

    const gridStartMin = gridConfig.startHour * 60;
    const gridEndMin = gridConfig.endHour * 60;

    // Bell Schedule conflicts
    if (filters.bellScheduleGrade) {
      const gradeBellSchedules = bellSchedules.filter(bs => {
        if (bs.day_of_week !== day) return false;
        // Handle comma-separated grade levels
        const grades = bs.grade_level.split(',').map(g => g.trim());
        return grades.includes(filters.bellScheduleGrade!);
      });
      
      gradeBellSchedules.forEach(schedule => {
        const [startH, startM] = schedule.start_time.split(':').map(Number);
        const [endH, endM] = schedule.end_time.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        
        if (startMin < gridEndMin && endMin > gridStartMin) {
          bands.push({
            startMin: Math.max(startMin, gridStartMin),
            endMin: Math.min(endMin, gridEndMin),
            color: GRADE_COLOR_MAP[filters.bellScheduleGrade!] || 'bg-gray-300',
            type: 'bell',
            opacity: 40,
          });
        }
      });
    }

    // Teacher/Special Activities conflicts
    if (filters.specialActivityTeacher) {
      // Find the selected teacher to get their name for fallback filtering
      const selectedTeacher = teachers.find(t => t.id === filters.specialActivityTeacher);
      const isLegacyId = filters.specialActivityTeacher.startsWith('legacy_');

      // For legacy IDs, the full teacher name is stored in last_name
      const teacherName = isLegacyId && selectedTeacher
        ? selectedTeacher.last_name
        : (selectedTeacher ? formatTeacherName(selectedTeacher) : null);

      // Filter special activities using teacher_id (preferred) or teacher_name (flexible fallback)
      // This handles records that haven't been fully migrated to teacher_id yet
      const teacherActivities = specialActivities.filter(sa => {
        if (sa.day_of_week !== day) return false;

        // For legacy IDs, match by teacher_name directly
        if (isLegacyId) {
          return sa.teacher_name === teacherName;
        }

        // For real teacher IDs, check teacher_id first (preferred), then fall back to teacher_name
        if (sa.teacher_id === filters.specialActivityTeacher) return true;
        if (teacherName && sa.teacher_name === teacherName) return true;
        return false;
      });

      // Find the teacher's primary grade for color using teacher_id (preferred) or teacher_name (fallback)
      const teacherStudents = students.filter(s => {
        // For legacy IDs, match by teacher_name directly
        if (isLegacyId) {
          return s.teacher_name === teacherName;
        }

        // For real teacher IDs, check teacher_id first (preferred), then fall back to teacher_name
        if (s.teacher_id === filters.specialActivityTeacher) return true;
        if (teacherName && s.teacher_name === teacherName) return true;
        return false;
      });
      const gradeCounts: Record<string, number> = teacherStudents.reduce((acc, s) => {
        acc[s.grade_level] = (acc[s.grade_level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const primaryGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      
      // Add bands for special activities
      teacherActivities.forEach(activity => {
        const [startH, startM] = activity.start_time.split(':').map(Number);
        const [endH, endM] = activity.end_time.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        
        
        if (startMin < gridEndMin && endMin > gridStartMin) {
          const band = {
            startMin: Math.max(startMin, gridStartMin),
            endMin: Math.min(endMin, gridEndMin),
            color: primaryGrade ? (GRADE_COLOR_MAP[primaryGrade] || 'bg-gray-300') : 'bg-gray-300',
            type: 'activity' as const,
            opacity: 40,
          };
          bands.push(band);
        }
      });
      
      // Note: We only show the teacher's special activities as conflict zones,
      // not the student sessions themselves
    }


    return bands;
  }, [day, bellSchedules, specialActivities, students, teachers, filters, gridConfig]);

  // Merge overlapping bands
  const mergedBands = useMemo(() => {
    if (availabilityBands.length === 0) return [];
    
    // Sort bands by start time
    const sorted = [...availabilityBands].sort((a, b) => a.startMin - b.startMin);
    const merged: typeof availabilityBands = [];
    
    let current = { ...sorted[0] };
    
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      // If bands overlap or touch
      if (next.startMin <= current.endMin) {
        // Merge them, extend the time range
        current.endMin = Math.max(current.endMin, next.endMin);
        // Keep the existing color (no gradient blending since we're only showing one grade/teacher at a time)
      } else {
        // No overlap, push current and start new
        merged.push(current);
        current = { ...next };
      }
    }
    
    merged.push(current);
    return merged;
  }, [availabilityBands]);

  // Convert bands to pixel positions
  const pixelBands = useMemo(() => {
    const gridStartMin = gridConfig.startHour * 60;
    const pxPerMin = gridConfig.pixelsPerHour / 60;
    
    return mergedBands.map((band, index) => {
      const topPx = (band.startMin - gridStartMin) * pxPerMin;
      const heightPx = (band.endMin - band.startMin) * pxPerMin;
      
      return {
        key: `band-${day}-${index}`,
        topPx,
        heightPx,
        color: band.color,
        opacity: band.opacity,
      };
    });
  }, [mergedBands, gridConfig, day]);

  
  return (
    <>
      {pixelBands.map(band => {
        return (
          <div
            key={band.key}
            className={`absolute w-full pointer-events-none transition-all duration-300 ease-in-out ${band.color}`}
            style={{
              top: `${band.topPx}px`,
              height: `${band.heightPx}px`,
              opacity: band.opacity / 100,
              left: '2px',
              right: '2px',
              zIndex: 5,
            }}
          />
        );
      })}
    </>
  );
}