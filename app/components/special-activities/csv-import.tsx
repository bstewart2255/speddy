'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../types/database';

interface Props {
  onSuccess: () => void;
}

export default function SpecialActivitiesCSVImport({ onSuccess }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClientComponentClient<Database>();

  const downloadTemplate = () => {
    const csvContent = 'Teacher,Grade,Activity,Start Time,End Time,Day\nSmith,K,Garden,10:00,11:00,Monday\nThompson,1,Art,12:00,13:00,Tuesday\nMiller,2,STEM,13:00,14:00,Wednesday\nGarcia,3,Music,09:00,10:00,Thursday\nJackson,4,Library,10:00,11:00,Friday';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Special_Activities_Template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const validateColumns = (data: any[]) => {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];
    const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());

    const requiredColumns = ['teacher', 'grade', 'activity', 'start time', 'end time', 'day'];
    const missing = requiredColumns.filter(col => {
      const colLower = col.toLowerCase();
      return !headers.some(header => 
        header === colLower || 
        header.replace(/\s+/g, '') === colLower.replace(/\s+/g, '')
      );
    });

    return missing.length === 0;
  };

  const dayNameToNumber = (dayName: string): number => {
    const days: { [key: string]: number } = {
      'monday': 1,
      'tuesday': 2,
      'wednesday': 3,
      'thursday': 4,
      'friday': 5
    };
    return days[dayName.toLowerCase()] || 1;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setImporting(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error('Not authenticated');

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.replace(/['"]/g, '').trim().toLowerCase(),
        complete: async (results) => {
          try {
            if (!validateColumns(results.data)) {
              throw new Error('CSV missing required columns: Teacher, Grade, Activity, Start Time, End Time, Day');
            }

            const activities = results.data
              .filter((row: any) => row.teacher && row.activity && row.day)
              .map((row: any) => ({
                provider_id: user.user!.id,
                teacher_name: row.teacher,
                activity_name: row.activity,
                day_of_week: dayNameToNumber(row.day),
                start_time: row['start time'],
                end_time: row['end time']
              }));

            if (activities.length > 0) {
              const { error: insertError } = await supabase
                .from('special_activities')
                .insert(activities);

              if (insertError) throw insertError;
              onSuccess();
            }
          } catch (err: any) {
            setError(err.message);
          } finally {
            setImporting(false);
          }
        },
        error: (err) => {
          setError(`CSV parsing error: ${err.message}`);
          setImporting(false);
        }
      });
    } catch (err: any) {
      setError(err.message);
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <button
          onClick={downloadTemplate}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          📥 Download Template
        </button>
        <label className={`px-4 py-2 ${importing ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'} text-white rounded cursor-pointer`}>
          {importing ? 'Importing...' : '📤 Upload CSV'}
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={importing}
            className="hidden"
          />
        </label>
      </div>
      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}
    </div>
  );
}