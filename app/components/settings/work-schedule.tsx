'use client';

import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';
import { Button } from '../ui/button';
import { getUserSiteSchedules, setUserSiteSchedule } from '../../../lib/supabase/queries/user-site-schedules';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CollapsibleCard } from '../ui/collapsible-card';

interface ProviderSchool {
  id: string;
  school_site: string;
  school_district: string;
}

const DAYS_OF_WEEK = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' }
];

export function WorkScheduleSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [schools, setSchools] = useState<ProviderSchool[]>([]);
  const [schedules, setSchedules] = useState<Record<string, number[]>>({});
  const supabase = createClient();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get provider's schools
      const { data: providerSchools } = await supabase
        .from('provider_schools')
        .select('id, school_site, school_district')
        .eq('provider_id', user.id);

      if (providerSchools) {
        setSchools(providerSchools);

        // Get existing schedules
        const existingSchedules = await getUserSiteSchedules(user.id);

        // Group schedules by site_id
        const scheduleMap: Record<string, number[]> = {};
        providerSchools.forEach(school => {
          scheduleMap[school.id] = [];
        });

        existingSchedules?.forEach(schedule => {
          if (!scheduleMap[schedule.site_id]) {
            scheduleMap[schedule.site_id] = [];
          }
          scheduleMap[schedule.site_id].push(schedule.day_of_week);
        });

        setSchedules(scheduleMap);
      }
    } catch (error) {
      console.error('Error loading work schedule:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleDay = (schoolId: string, day: number) => {
    setSchedules(prev => {
      const schoolDays = prev[schoolId] || [];
      if (schoolDays.includes(day)) {
        return {
          ...prev,
          [schoolId]: schoolDays.filter(d => d !== day)
        };
      } else {
        return {
          ...prev,
          [schoolId]: [...schoolDays, day].sort()
        };
      }
    });
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save each school's schedule
      for (const school of schools) {
        await setUserSiteSchedule(
          user.id,
          school.id,
          schedules[school.id] || []
        );
      }

      // Show success message or toast here
      alert('Work schedule saved successfully!');
    } catch (error) {
      console.error('Error saving schedule:', error);
      alert('Error saving schedule. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  return (
    <CollapsibleCard title="Work Schedule" defaultOpen={false}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Specify which days you work at the different sites. This is required in order for the auto-scheduling system to correctly assign sessions.
        </p>

        {schools.map((school) => (
          <div key={school.id} className="border rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3">
              {school.school_site}
              <span className="text-sm text-gray-500 ml-2">
                ({school.school_district})
              </span>
            </h4>
            <div className="flex gap-2">
              {DAYS_OF_WEEK.map((day) => {
                const isSelected = schedules[school.id]?.includes(day.value);
                return (
                  <button
                    key={day.value}
                    onClick={() => toggleDay(school.id, day.value)}
                    className={`
                      px-3 py-2 rounded-md text-sm font-medium transition-colors
                      ${isSelected 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }
                    `}
                  >
                    {day.short}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <div className="flex justify-end pt-4">
          <Button
            onClick={saveSchedule}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Schedule'}
          </Button>
        </div>
      </div>
    </CollapsibleCard>
  );
}