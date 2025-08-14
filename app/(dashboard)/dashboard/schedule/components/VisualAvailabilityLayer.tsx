'use client';

import React, { useMemo } from 'react';

interface VisualAvailabilityLayerProps {
  day: number;
  bellSchedules: any[];
  specialActivities: any[];
  schoolHours: any[];
  sessions: any[];
  students: any[];
  filters: {
    bellScheduleGrade: string | null;
    specialActivityTeacher: string | null;
  };
  gridConfig: {
    startHour: number;
    endHour: number;
    pixelsPerHour: number;
  };
}

// Grade color mapping - using complete Tailwind classes
const GRADE_COLOR_MAP: { [key: string]: string } = {
  K: 'bg-purple-300',
  '1': 'bg-sky-300',
  '2': 'bg-green-300',
  '3': 'bg-blue-300',
  '4': 'bg-yellow-300',
  '5': 'bg-pink-300',
};

export function VisualAvailabilityLayer({
  day,
  bellSchedules,
  specialActivities,
  schoolHours,
  sessions,
  students,
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
      const gradeBellSchedules = bellSchedules.filter(
        bs => bs.grade_level === filters.bellScheduleGrade && bs.day_of_week === day
      );
      console.log('[VisualAvailabilityLayer] Found bell schedules:', gradeBellSchedules.length, 'for grade', filters.bellScheduleGrade, 'on day', day);
      
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
      
      // First, show special activities for this teacher
      // Note: special activities use 'teacher_name' field, not 'teacher'
      const teacherActivities = specialActivities.filter(
        sa => sa.teacher_name === filters.specialActivityTeacher && sa.day_of_week === day
      );
      
      // Find the teacher's primary grade for color
      const teacherStudents = students.filter(s => s.teacher_name === filters.specialActivityTeacher);
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
  }, [day, bellSchedules, specialActivities, schoolHours, sessions, students, filters, gridConfig]);

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
        // Merge them, keeping the most restrictive color/type
        current.endMin = Math.max(current.endMin, next.endMin);
        
        // If different types, create a striped pattern indicator
        if (current.type !== next.type) {
          current.color = 'bg-gradient-to-r from-red-300 to-blue-300';
          current.opacity = 50;
        }
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