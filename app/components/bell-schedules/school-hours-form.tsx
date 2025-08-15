'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { upsertSchoolHours, getSchoolHours, cleanupKindergartenSchedules, cleanupTKSchedules } from '../../../lib/supabase/queries/school-hours';
import { useSchool } from '../providers/school-context';

type TimeSlot = {
  start: string;
  end: string;
};

type DaySchedule = {
  monday: TimeSlot;
  tuesday: TimeSlot;
  wednesday: TimeSlot;
  thursday: TimeSlot;
  friday: TimeSlot;
};

type ScheduleType = 'default' | 'tk' | 'k' | 'k-am' | 'k-pm' | 'tk-am' | 'tk-pm';

export default function SchoolHoursForm({ onSuccess }: { onSuccess: () => void }) {
  const { currentSchool } = useSchool();
  const [loading, setLoading] = useState(false);
  const [showTK, setShowTK] = useState(false);
  const [showK, setShowK] = useState(false); // Defaults to false

  // Default schedule state
  const [defaultSchedule, setDefaultSchedule] = useState<DaySchedule>({
    monday: { start: '08:00', end: '15:00' },
    tuesday: { start: '08:00', end: '15:00' },
    wednesday: { start: '08:00', end: '15:00' },
    thursday: { start: '08:00', end: '15:00' },
    friday: { start: '08:00', end: '15:00' }
  });

  const [tkSchedule, setTkSchedule] = useState<DaySchedule>({
    monday: { start: '08:00', end: '15:00' },
    tuesday: { start: '08:00', end: '15:00' },
    wednesday: { start: '08:00', end: '15:00' },
    thursday: { start: '08:00', end: '15:00' },
    friday: { start: '08:00', end: '15:00' }
  });

  const [kSchedule, setKSchedule] = useState<DaySchedule>({
    monday: { start: '08:00', end: '15:00' },
    tuesday: { start: '08:00', end: '15:00' },
    wednesday: { start: '08:00', end: '15:00' },
    thursday: { start: '08:00', end: '15:00' },
    friday: { start: '08:00', end: '15:00' }
  });

  const [showKAM, setShowKAM] = useState(false);
  const [showKPM, setShowKPM] = useState(false);
  const [showTKAM, setShowTKAM] = useState(false);
  const [showTKPM, setShowTKPM] = useState(false);

  const [kAMSchedule, setKAMSchedule] = useState<DaySchedule>({
    monday: { start: '08:00', end: '11:30' },
    tuesday: { start: '08:00', end: '11:30' },
    wednesday: { start: '08:00', end: '11:30' },
    thursday: { start: '08:00', end: '11:30' },
    friday: { start: '08:00', end: '11:30' }
  });

  const [kPMSchedule, setKPMSchedule] = useState<DaySchedule>({
    monday: { start: '12:00', end: '15:00' },
    tuesday: { start: '12:00', end: '15:00' },
    wednesday: { start: '12:00', end: '15:00' },
    thursday: { start: '12:00', end: '15:00' },
    friday: { start: '12:00', end: '15:00' }
  });

  const [tkAMSchedule, setTKAMSchedule] = useState<DaySchedule>({
    monday: { start: '08:00', end: '11:30' },
    tuesday: { start: '08:00', end: '11:30' },
    wednesday: { start: '08:00', end: '11:30' },
    thursday: { start: '08:00', end: '11:30' },
    friday: { start: '08:00', end: '11:30' }
  });

  const [tkPMSchedule, setTKPMSchedule] = useState<DaySchedule>({
    monday: { start: '12:00', end: '15:00' },
    tuesday: { start: '12:00', end: '15:00' },
    wednesday: { start: '12:00', end: '15:00' },
    thursday: { start: '12:00', end: '15:00' },
    friday: { start: '12:00', end: '15:00' }
  });

  // Load existing school hours with intelligent filtering
  useEffect(() => {
    const loadSchoolHours = async () => {
      try {
        // Pass full school identifier for optimized queries
        const hours = await getSchoolHours(currentSchool || undefined);

        // Process loaded hours into our state structure
        hours.forEach(hour => {
          const day = dayNumberToName(hour.day_of_week).toLowerCase() as keyof DaySchedule;
          const timeSlot = {
            start: hour.start_time.substring(0, 5),
            end: hour.end_time.substring(0, 5)
          };

          if (hour.grade_level === 'default') {
            setDefaultSchedule(prev => ({ ...prev, [day]: timeSlot }));
          } else if (hour.grade_level === 'TK') {
            setShowTK(true); // Only set to true when K-specific data exists
            setTkSchedule(prev => ({ ...prev, [day]: timeSlot }));
          } else if (hour.grade_level === 'K') {
            setShowK(true); // Only set to true when K-specific data exists
            setKSchedule(prev => ({ ...prev, [day]: timeSlot }));
          } else if (hour.grade_level === 'K-AM') {
            setShowKAM(true);
            setKAMSchedule(prev => ({ ...prev, [day]: timeSlot }));
          } else if (hour.grade_level === 'K-PM') {
            setShowKPM(true);
            setKPMSchedule(prev => ({ ...prev, [day]: timeSlot }));
          } else if (hour.grade_level === 'TK-AM') {
            setShowTKAM(true);
            setTKAMSchedule(prev => ({ ...prev, [day]: timeSlot }));
          } else if (hour.grade_level === 'TK-PM') {
            setShowTKPM(true);
            setTKPMSchedule(prev => ({ ...prev, [day]: timeSlot }));
          }
        });
      } catch (error) {
        console.error('Error loading school hours:', error);
      }
    };

    loadSchoolHours();
  }, [currentSchool]);

  const dayNumberToName = (num: number): string => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days[num - 1] || 'Monday';
  };

  const dayNameToNumber = (name: string): number => {
    const days: Record<string, number> = {
      'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5
    };
    return days[name.toLowerCase()] || 1;
  };

  const handleTimeChange = (
    schedule: ScheduleType,
    day: keyof DaySchedule,
    field: 'start' | 'end',
    value: string
  ) => {
    if (schedule === 'default') {
      setDefaultSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    } else if (schedule === 'tk') {
      setTkSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    } else if (schedule === 'k') {
      setKSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    } else if (schedule === 'k-am') {
      setKAMSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    } else if (schedule === 'k-pm') {
      setKPMSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    } else if (schedule === 'tk-am') {
      setTKAMSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    } else if (schedule === 'tk-pm') {
      setTKPMSchedule(prev => ({
        ...prev,
        [day]: { ...prev[day], [field]: value }
      }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    // Validate that currentSchool exists
    if (!currentSchool?.school_site) {
      alert('No school selected. Please select a school before saving hours.');
      setLoading(false);
      return;
    }

    const promises: Promise<any>[] = [];

    try {
      // Save default schedule
      for (const [day, times] of Object.entries(defaultSchedule)) {
        promises.push(
          upsertSchoolHours({
            school_site: currentSchool?.school_site,
            day_of_week: dayNameToNumber(day),
            grade_level: 'default',
            start_time: times.start + ':00',
            end_time: times.end + ':00'
          })
        );
      }

      // Clean up K schedules if checkbox is unchecked
      if (!showK) {
        await cleanupKindergartenSchedules(currentSchool || undefined);
      }

      // Save K schedule if enabled
      if (showK) {
        // If no AM/PM specified, save as regular K schedule
        if (!showKAM && !showKPM) {
          Object.entries(kSchedule).forEach(([day, times]) => {
            promises.push(
              upsertSchoolHours({
                school_site: currentSchool?.school_site,
                day_of_week: dayNameToNumber(day),
                grade_level: 'K',
                start_time: times.start + ':00',
                end_time: times.end + ':00'
              })
            );
          });
        }

        // Save K-AM schedule if enabled
        if (showKAM) {
          Object.entries(kAMSchedule).forEach(([day, times]) => {
            promises.push(
              upsertSchoolHours({
                school_site: currentSchool?.school_site,
                day_of_week: dayNameToNumber(day),
                grade_level: 'K-AM',
                start_time: times.start + ':00',
                end_time: times.end + ':00'
              })
            );
          });
        }

        // Save K-PM schedule if enabled
        if (showKPM) {
          Object.entries(kPMSchedule).forEach(([day, times]) => {
            promises.push(
              upsertSchoolHours({
                school_site: currentSchool?.school_site,
                day_of_week: dayNameToNumber(day),
                grade_level: 'K-PM',
                start_time: times.start + ':00',
                end_time: times.end + ':00'
              })
            );
          });
        }
      }

      // Clean up TK schedules if checkbox is unchecked
      if (!showTK) {
        await cleanupTKSchedules(currentSchool || undefined);
      }

      // Save TK schedule if enabled
      if (showTK) {
        // If no AM/PM specified, save as regular TK schedule
        if (!showTKAM && !showTKPM) {
          Object.entries(tkSchedule).forEach(([day, times]) => {
            promises.push(
              upsertSchoolHours({
                school_site: currentSchool?.school_site,
                day_of_week: dayNameToNumber(day),
                grade_level: 'TK',
                start_time: times.start + ':00',
                end_time: times.end + ':00'
              })
            );
          });
        }

        // Save TK-AM schedule if enabled
        if (showTKAM) {
          Object.entries(tkAMSchedule).forEach(([day, times]) => {
            promises.push(
              upsertSchoolHours({
                school_site: currentSchool?.school_site,
                day_of_week: dayNameToNumber(day),
                grade_level: 'TK-AM',
                start_time: times.start + ':00',
                end_time: times.end + ':00'
              })
            );
          });
        }

        // Save TK-PM schedule if enabled
        if (showTKPM) {
          Object.entries(tkPMSchedule).forEach(([day, times]) => {
            promises.push(
              upsertSchoolHours({
                school_site: currentSchool?.school_site,
                day_of_week: dayNameToNumber(day),
                grade_level: 'TK-PM',
                start_time: times.start + ':00',
                end_time: times.end + ':00'
              })
            );
          });
        }
      }

      // Wait for all promises to complete
      await Promise.all(promises);
        
      onSuccess();
    } catch (error) {
      console.error('Error saving school hours:', error);
      
      // Provide more specific error messages
      if (error instanceof Error) {
        if (error.message.includes('constraint')) {
          alert('Failed to save school hours: Duplicate entry detected. Please check your input.');
        } else if (error.message.includes('school_site')) {
          alert('Failed to save school hours: School information is missing. Please refresh and try again.');
        } else if (error.message.includes('day_of_week')) {
          alert('Failed to save school hours: Day of week is missing. Please refresh and try again.');
        } else if (error.message.includes('grade_level')) {
          alert('Failed to save school hours: Grade level is missing. Please refresh and try again.');
        } else {
          alert(`Failed to save school hours: ${error.message}`);
        }
      } else {
        alert('Failed to save school hours. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const timeOptions: Array<{ value: string; label: string }> = [];
  for (let hour = 6; hour <= 18; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
      const amPm = hour >= 12 ? 'PM' : 'AM';
      const label = `${displayHour}:${minute.toString().padStart(2, '0')} ${amPm}`;
      timeOptions.push({ value: time, label });
    }
  }

  const renderScheduleGrid = (
    schedule: DaySchedule,
    scheduleType: ScheduleType,
    title: string
  ) => (
    <div className="mb-6">
      <h4 className="text-sm font-medium text-gray-700 mb-3">{title}</h4>
      <div className="grid grid-cols-5 gap-4">
        {Object.entries(schedule).map(([day, times]) => (
          <div key={day} className="space-y-2">
            <label className="block text-xs font-medium text-gray-600 capitalize">
              {day}
            </label>
            <select
              value={times.start}
              onChange={(e) =>
                handleTimeChange(scheduleType, day as keyof DaySchedule, 'start', e.target.value)
              }
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              {timeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <select
              value={times.end}
              onChange={(e) =>
                handleTimeChange(scheduleType, day as keyof DaySchedule, 'end', e.target.value)
              }
              className="w-full text-sm border border-gray-300 rounded-md px-2 py-1"
            >
              {timeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {renderScheduleGrid(defaultSchedule, 'default', 'School Hours (Grades 1-5)')}

      <div className="space-y-3">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showK}
            onChange={(e) => {
              setShowK(e.target.checked);
              if (!e.target.checked) {
                setShowKAM(false);
                setShowKPM(false);
              }
            }}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">
            Different schedule for Kindergarten
          </span>
        </label>

        {showK && (
          <div className="ml-6 space-y-3">
            {renderScheduleGrid(kSchedule, 'k', 'Kindergarten Hours (All Day)')}

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showKAM}
                onChange={(e) => setShowKAM(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                Separate AM schedule
              </span>
            </label>

            {showKAM && renderScheduleGrid(kAMSchedule, 'k-am', 'Kindergarten AM Hours')}

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showKPM}
                onChange={(e) => setShowKPM(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                Separate PM schedule
              </span>
            </label>

            {showKPM && renderScheduleGrid(kPMSchedule, 'k-pm', 'Kindergarten PM Hours')}
          </div>
        )}

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={showTK}
            onChange={(e) => {
              setShowTK(e.target.checked);
              if (!e.target.checked) {
                setShowTKAM(false);
                setShowTKPM(false);
              }
            }}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">
            Different schedule for TK
          </span>
        </label>

        {showTK && (
          <div className="ml-6 space-y-3">
            {renderScheduleGrid(tkSchedule, 'tk', 'TK Hours (All Day)')}

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showTKAM}
                onChange={(e) => setShowTKAM(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                Separate AM schedule
              </span>
            </label>

            {showTKAM && renderScheduleGrid(tkAMSchedule, 'tk-am', 'TK AM Hours')}

            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showTKPM}
                onChange={(e) => setShowTKPM(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                Separate PM schedule
              </span>
            </label>

            {showTKPM && renderScheduleGrid(tkPMSchedule, 'tk-pm', 'TK PM Hours')}
          </div>
        )}
      </div>

      <Button type="submit" disabled={loading} variant="primary">
        {loading ? 'Saving...' : 'Save School Hours'}
      </Button>
    </form>
  );
}