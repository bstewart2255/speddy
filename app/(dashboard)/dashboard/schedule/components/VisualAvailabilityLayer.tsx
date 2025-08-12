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
    showProviderSchedule: boolean;
    showSchoolHours: boolean;
  };
  gridConfig: {
    startHour: number;
    endHour: number;
    pixelsPerHour: number;
  };
}

// Grade color mapping - same as in ScheduleGrid
const GRADE_COLOR_MAP: { [key: string]: string } = {
  K: 'purple',
  '1': 'sky',
  '2': 'green',
  '3': 'blue',
  '4': 'yellow',
  '5': 'pink',
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
      type: 'bell' | 'activity' | 'provider' | 'schoolHours';
      opacity: number;
    }> = [];

    const gridStartMin = gridConfig.startHour * 60;
    const gridEndMin = gridConfig.endHour * 60;

    // Bell Schedule conflicts
    if (filters.bellScheduleGrade) {
      const gradeBellSchedules = bellSchedules.filter(
        bs => bs.grade_level === filters.bellScheduleGrade && bs.day_of_week === day
      );
      
      gradeBellSchedules.forEach(schedule => {
        const [startH, startM] = schedule.start_time.split(':').map(Number);
        const [endH, endM] = schedule.end_time.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        
        if (startMin < gridEndMin && endMin > gridStartMin) {
          bands.push({
            startMin: Math.max(startMin, gridStartMin),
            endMin: Math.min(endMin, gridEndMin),
            color: `bg-${GRADE_COLOR_MAP[filters.bellScheduleGrade] || 'gray'}-300`,
            type: 'bell',
            opacity: 40,
          });
        }
      });
    }

    // Special Activities conflicts
    if (filters.specialActivityTeacher) {
      const teacherActivities = specialActivities.filter(
        sa => sa.teacher === filters.specialActivityTeacher && sa.day_of_week === day
      );
      
      // Find the teacher's primary grade for color
      const teacherStudents = students.filter(s => s.teacher_name === filters.specialActivityTeacher);
      const gradeCounts = teacherStudents.reduce((acc, s) => {
        acc[s.grade_level] = (acc[s.grade_level] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const primaryGrade = Object.entries(gradeCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
      
      teacherActivities.forEach(activity => {
        const [startH, startM] = activity.start_time.split(':').map(Number);
        const [endH, endM] = activity.end_time.split(':').map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        
        if (startMin < gridEndMin && endMin > gridStartMin) {
          bands.push({
            startMin: Math.max(startMin, gridStartMin),
            endMin: Math.min(endMin, gridEndMin),
            color: primaryGrade ? `bg-${GRADE_COLOR_MAP[primaryGrade] || 'gray'}-300` : 'bg-gray-300',
            type: 'activity',
            opacity: 40,
          });
        }
      });
    }

    // School Hours conflicts
    if (filters.showSchoolHours) {
      // Assuming school hours end at 3:00 PM (15:00)
      const schoolEndHour = 15;
      const schoolEndMin = schoolEndHour * 60;
      
      if (schoolEndMin < gridEndMin) {
        bands.push({
          startMin: Math.max(schoolEndMin, gridStartMin),
          endMin: gridEndMin,
          color: 'bg-red-300',
          type: 'schoolHours',
          opacity: 30,
        });
      }
    }

    // Provider Schedule conflicts (placeholder - would need provider availability data)
    if (filters.showProviderSchedule) {
      // This would typically check against provider availability
      // For now, we'll just show a sample unavailable period
      // In real implementation, this would query provider schedules
    }

    return bands;
  }, [day, bellSchedules, specialActivities, schoolHours, students, filters, gridConfig]);

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
      {pixelBands.map(band => (
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
      ))}
    </>
  );
}