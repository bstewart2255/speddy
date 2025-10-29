'use client';

import { useState } from 'react';
import Papa from 'papaparse';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '../../../src/types/database';

interface Props {
  onSuccess: () => void;
  currentSchool?: {
    school_site: string;
    school_district: string;
  } | null;
}

export default function StudentsCSVImport({ onSuccess, currentSchool }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient<Database>();

  const downloadTemplate = () => {
    const csvContent = `Initials,Grade,Teacher,Sessions Per Week,Minutes Per Session
JD,3,Smith,2,30
AB,K,Johnson,3,20
CD,5,Davis,1,45
EF,2,Wilson,2,30
GH,4,Garcia,3,30`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Students_Template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const validateColumns = (data: any[]) => {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];
    const headers = Object.keys(firstRow).map(h => h.toLowerCase().trim());

    // Only initials, grade, and teacher are required
    // Sessions per week and minutes per session are optional
    const requiredColumns = ['initials', 'grade', 'teacher'];
    const missing = requiredColumns.filter(col => {
      const colLower = col.toLowerCase();
      return !headers.some(header =>
        header === colLower ||
        header.replace(/\s+/g, '') === colLower.replace(/\s+/g, '')
      );
    });

    if (missing.length > 0) {
      console.log('Missing columns:', missing);
      console.log('Found headers:', headers);
    }

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
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: async (results) => {
          console.log('Parsed data:', results.data);
          try {
            if (!validateColumns(results.data)) {
              throw new Error('CSV missing required columns. Required: Initials, Grade, Teacher. Optional: Sessions Per Week, Minutes Per Session');
            }

            const students = results.data
              .filter((row: any) => row.initials && row.grade && row.teacher)
              .map((row: any) => {
                const student: any = {
                  provider_id: user.user!.id,
                  initials: row.initials.toUpperCase().trim(),
                  grade_level: row.grade.toString().toUpperCase().trim(),
                  teacher_name: row.teacher.trim(),
                  school_site: currentSchool?.school_site || '',
                  school_district: currentSchool?.school_district || ''
                };

                // Only include schedule requirements if they're present
                if (row['sessions per week']) {
                  student.sessions_per_week = parseInt(row['sessions per week']);
                }
                if (row['minutes per session']) {
                  student.minutes_per_session = parseInt(row['minutes per session']);
                }

                return student;
              });

            console.log('Students to insert:', students);

            if (students.length > 0) {
              const { data: insertedStudents, error: insertError } = await supabase
                .from('students')
                .insert(students)
                .select();

              if (insertError) {
                console.error('Insert error:', insertError);
                throw insertError;
              }

              // Create unscheduled sessions for students with schedule requirements
              let studentsWithSessions = 0;
              if (insertedStudents && insertedStudents.length > 0) {
                const allSessions: any[] = [];

                insertedStudents.forEach((student) => {
                  // Only create sessions if both requirements are present
                  if (student.sessions_per_week && student.minutes_per_session) {
                    const unscheduledSessions = Array.from({ length: student.sessions_per_week }, () => ({
                      student_id: student.id,
                      provider_id: user.user!.id,
                      day_of_week: null,
                      start_time: null,
                      end_time: null,
                      minutes_per_session: student.minutes_per_session,
                      status: 'active' as const,
                      delivered_by: 'provider' as const,
                    }));
                    allSessions.push(...unscheduledSessions);
                    studentsWithSessions++;
                  }
                });

                // Bulk insert all sessions at once
                if (allSessions.length > 0) {
                  const { error: sessionsError } = await supabase
                    .from('schedule_sessions')
                    .insert(allSessions);

                  if (sessionsError) {
                    console.error('Sessions creation error:', sessionsError);
                    // Don't throw - students were created successfully
                    alert(`Successfully imported ${students.length} students, but failed to create sessions. You can add them manually from the Schedule page.`);
                  } else {
                    alert(`Successfully imported ${students.length} students! ${studentsWithSessions} students have sessions created in Unscheduled Sessions.`);
                  }
                } else {
                  alert(`Successfully imported ${students.length} students! No sessions created (missing schedule requirements).`);
                }
              } else {
                alert(`Successfully imported ${students.length} students!`);
              }

              onSuccess();
            } else {
              throw new Error('No valid students found in CSV');
            }
          } catch (err: any) {
            console.error('Import error:', err);
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
      <div className="bg-green-50 border-2 border-dashed border-green-300 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg className="mx-auto h-12 w-12 text-green-400" stroke="currentColor" fill="none" viewBox="0 0 48 48">
            <path d="M7 40h34a3 3 0 003-3V11a3 3 0 00-3-3H17l-2 5H7a3 3 0 00-3 3v21a3 3 0 003 3z" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            <path d="M24 22v10m-5-5h10" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="mb-4">
          <p className="text-lg font-medium text-gray-900 mb-2">Upload Students CSV</p>
          <p className="text-sm text-gray-600">
            <strong>Required:</strong> Initials, Grade, Teacher<br />
            <strong>Optional:</strong> Sessions Per Week, Minutes Per Session
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Grade format: K, 1, 2, 3, 4, 5, etc. • Sessions are auto-created in Unscheduled Sessions when schedule requirements are included.
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={importing}
            className="hidden"
            id="students-csv-upload"
          />
          <label htmlFor="students-csv-upload">
            <span className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${importing ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700 cursor-pointer'}`}>
              {importing ? 'Importing...' : 'Choose File'}
            </span>
          </label>
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Download Template
          </button>
        </div>
      </div>
      {error && (
        <div className="text-red-600 text-sm bg-red-50 p-3 rounded">
          {error}
        </div>
      )}
    </div>
  );
} 