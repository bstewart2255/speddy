'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '../../../types/database';

interface Props {
  onSuccess: () => void;
}

export default function BellScheduleCSVImport({ onSuccess }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClientComponentClient<Database>();

  const downloadTemplate = () => {
    const csvContent = 'Grade,Activity,Start Time,End Time\nK,Recess,09:00,09:30\n1,Recess,10:00,10:30\n2,Recess,11:00,11:30\n3,Lunch,12:00,12:30\n4,Recess,13:00,13:30\n5,Recess,14:00,14:30';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Bell_Schedule_Template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const validateColumns = (data: any[]) => {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];
    const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());

    console.log('Headers found:', headers);

    const requiredColumns = ['grade', 'activity', 'start time', 'end time'];
    const missing = requiredColumns.filter(col => {
      const colLower = col.toLowerCase();
      return !headers.some(header => 
        header === colLower || 
        header.replace(/\s+/g, '') === colLower.replace(/\s+/g, '') ||
        header.includes(col.split(' ')[0])
      );
    });

    console.log('Missing columns:', missing);
    return missing.length === 0;
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
          console.log('Parsed data:', results.data);
          console.log('First row:', results.data[0]);
          try {
            if (!validateColumns(results.data)) {
              throw new Error('CSV missing required columns: Grade, Activity, Start Time, End Time');
            }

            const schedules = results.data
            .filter((row: any) => row.grade && row.activity)
            .flatMap((row: any) => {
              // All lowercase now due to transformHeader
              const grade = row.grade;
              const activity = row.activity;
              const startTime = row['start time'];
              const endTime = row['end time'];

              console.log('Processing row:', { grade, activity, startTime, endTime });

              return [1, 2, 3, 4, 5].map(dayNum => ({
                provider_id: user.user!.id,
                grade_level: grade,
                period_name: activity,
                day_of_week: dayNum,
                start_time: startTime,
                end_time: endTime
              }));
            });

            if (schedules.length > 0) {
              const { error: insertError } = await supabase
                .from('bell_schedules')
                .insert(schedules);

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