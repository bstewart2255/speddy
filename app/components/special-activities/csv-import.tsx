"use client";

import { useState } from "react";
import Papa from "papaparse";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "../../../src/types/database";
import { useSchool } from "../../components/providers/school-context";
import { dedupeSpecialActivities, normalizeSpecialActivity, createImportSummary } from '../../../lib/utils/dedupe-helpers';
import { SPECIAL_ACTIVITY_TYPES } from '../../../lib/constants/activity-types';

interface Teacher {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  onSuccess: () => void;
}

export default function SpecialActivitiesCSVImport({ onSuccess }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient<Database>();
  const { currentSchool } = useSchool();

  const downloadTemplate = () => {
    const csvContent = `Teacher,Activity,Day,Start Time,End Time
Smith,PE,Monday,10:00,11:00
Johnson,Library,Tuesday,09:00,09:45
Davis,Music,Wednesday,13:00,14:00
Wilson,ART,Thursday,11:00,11:45
Garcia,STEAM,Friday,14:00,14:45
Brown,STEM,Monday,09:00,09:45
Lee,Garden,Tuesday,10:00,10:45`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Special_Activities_Template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const dayNameToNumber = (dayName: string): number => {
    const days: { [key: string]: number } = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
    };
    return days[dayName.toLowerCase().trim()] || 1;
  };

  // Convert time to 24-hour format (HH:MM)
  // Handles: "1:00 PM", "13:00", "1:00" (assumes PM for 1-6, AM for 7-11)
  const convertTo24Hour = (timeStr: string): string => {
    if (!timeStr) return '';
    const cleaned = timeStr.trim().toUpperCase();

    // Check for AM/PM suffix
    const hasAM = cleaned.includes('AM');
    const hasPM = cleaned.includes('PM');
    const timeOnly = cleaned.replace(/\s*(AM|PM)\s*/gi, '').trim();

    // Parse hours and minutes
    const match = timeOnly.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return timeStr; // Return original if can't parse

    let hours = parseInt(match[1], 10);
    const minutes = match[2];

    if (hasAM) {
      // AM: 12 AM = 00, otherwise keep as-is
      if (hours === 12) hours = 0;
    } else if (hasPM) {
      // PM: 12 PM = 12, otherwise add 12
      if (hours !== 12) hours += 12;
    } else {
      // No AM/PM specified - use school schedule logic
      // Times 1-6 are almost certainly PM for school schedules
      // Times 7-11 are AM, 12 is PM
      if (hours >= 1 && hours <= 6) {
        hours += 12; // 1:00 -> 13:00, etc.
      }
      // Hours 7-11 stay as-is (AM)
      // Hour 12 stays as-is (PM)
    }

    return `${hours.toString().padStart(2, '0')}:${minutes}`;
  };

  // Match a CSV teacher name to a teacher in the database
  // Handles: "Smith" (last name only), "John Smith", "Smith, John"
  const matchTeacher = (csvName: string, teachers: Teacher[]): Teacher | null => {
    const searchName = csvName.trim().toLowerCase();
    if (!searchName) return null;

    // Try exact match on last name
    const lastNameMatch = teachers.find(
      t => t.last_name?.toLowerCase() === searchName
    );
    if (lastNameMatch) return lastNameMatch;

    // Try exact match on first name (less common but possible)
    const firstNameMatch = teachers.find(
      t => t.first_name?.toLowerCase() === searchName
    );
    if (firstNameMatch) return firstNameMatch;

    // Try "First Last" format
    const fullNameMatch = teachers.find(t => {
      const fullName = `${t.first_name || ''} ${t.last_name || ''}`.trim().toLowerCase();
      return fullName === searchName;
    });
    if (fullNameMatch) return fullNameMatch;

    // Try "Last, First" format
    const lastFirstMatch = teachers.find(t => {
      const lastFirst = `${t.last_name || ''}, ${t.first_name || ''}`.trim().toLowerCase();
      return lastFirst === searchName;
    });
    if (lastFirstMatch) return lastFirstMatch;

    // Try partial match - if CSV name is contained in last name or vice versa
    const partialMatch = teachers.find(t => {
      const lastName = t.last_name?.toLowerCase() || '';
      return lastName.includes(searchName) || searchName.includes(lastName);
    });
    if (partialMatch) return partialMatch;

    return null;
  };

  const validateColumns = (data: any[]) => {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];
    const headers = Object.keys(firstRow).map((h) => h.toLowerCase().trim());

    console.log("Headers found:", headers);

    const requiredColumns = [
      "teacher",
      "activity",
      "day",
      "start time",
      "end time",
    ];
    const missing = requiredColumns.filter((col) => {
      const colLower = col.toLowerCase();
      return !headers.some(
        (header) =>
          header === colLower ||
          header.replace(/\s+/g, "") === colLower.replace(/\s+/g, ""),
      );
    });

    if (missing.length > 0) {
      console.log("Missing columns:", missing);
    }

    return missing.length === 0;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setImporting(true);

    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Not authenticated");

      // Fetch teachers for the current school
      const { data: schoolTeachers } = await supabase
        .from('teachers')
        .select('id, first_name, last_name')
        .eq('school_id', currentSchool?.school_id || '');

      const teachers: Teacher[] = schoolTeachers || [];
      console.log(`Found ${teachers.length} teachers for school`);

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim().toLowerCase(),
        complete: async (results) => {
          console.log("Parsed data:", results.data);
          try {
            if (!validateColumns(results.data)) {
              throw new Error(
                "CSV missing required columns. Expected: Teacher, Activity, Day, Start Time, End Time",
              );
            }

            // Validate activity values (case-insensitive)
            const invalidActivities: string[] = [];
            const normalizeActivity = (input: string): string | null => {
              const trimmed = input.trim();
              return SPECIAL_ACTIVITY_TYPES.find(
                (a) => a.toLowerCase() === trimmed.toLowerCase()
              ) || null;
            };

            results.data.forEach((row: any, index: number) => {
              if (row.activity) {
                const normalized = normalizeActivity(row.activity);
                if (!normalized) {
                  invalidActivities.push(`Row ${index + 2}: "${row.activity.trim()}"`);
                }
              }
            });

            if (invalidActivities.length > 0) {
              throw new Error(
                `Invalid activity values found:\n${invalidActivities.join('\n')}\n\nValid activities are: ${SPECIAL_ACTIVITY_TYPES.join(', ')}`
              );
            }

            // Track unmatched teachers for reporting
            const unmatchedTeachers = new Set<string>();

            const rawActivities = results.data
              .filter((row: any) => row.teacher && row.activity && row.day)
              .map((row: any) => {
                const csvTeacherName = row.teacher.trim();
                const matchedTeacher = matchTeacher(csvTeacherName, teachers);

                if (!matchedTeacher) {
                  unmatchedTeachers.add(csvTeacherName);
                }

                return {
                  teacher_name: matchedTeacher
                    ? `${matchedTeacher.first_name || ''} ${matchedTeacher.last_name || ''}`.trim()
                    : csvTeacherName,
                  teacher_id: matchedTeacher?.id || null,
                  // Use normalized activity name to ensure correct casing
                  activity_name: normalizeActivity(row.activity) || row.activity.trim(),
                  day_of_week: dayNameToNumber(row.day),
                  start_time: convertTo24Hour(row['start time'] || ''),
                  end_time: convertTo24Hour(row['end time'] || '')
                };
              });

            console.log("Raw activities:", rawActivities);

            if (rawActivities.length === 0) {
              throw new Error("No valid activities found in CSV");
            }

            // Deduplicate activities
            const dedupedActivities = dedupeSpecialActivities(rawActivities);
            const summary = createImportSummary();
            summary.total = rawActivities.length;
            summary.skipped = rawActivities.length - dedupedActivities.length;

            // Get existing activities
            const { data: existingActivities } = await supabase
              .from('special_activities')
              .select('*')
              .eq('provider_id', user.user!.id)
              .eq('school_id', currentSchool?.school_id || '');

            // Create a map of existing activities by normalized key
            const existingMap = new Map();
            if (existingActivities) {
              for (const activity of existingActivities) {
                const normalized = normalizeSpecialActivity(activity);
                existingMap.set(normalized.normalized_key, activity.id);
              }
            }

            // Process each deduplicated activity
            for (const activity of dedupedActivities) {
              const activityData: any = {
                provider_id: user.user!.id,
                teacher_name: activity.teacher_name,
                teacher_id: activity.teacher_id || null,
                activity_name: activity.activity_name,
                day_of_week: activity.day_of_week,
                start_time: activity.start_time,
                end_time: activity.end_time,
                school_id: currentSchool?.school_id,
                content_hash: activity.content_hash
              };

              if (existingMap.has(activity.normalized_key)) {
                // Update existing record
                const { error } = await supabase
                  .from('special_activities')
                  .update(activityData)
                  .eq('id', existingMap.get(activity.normalized_key));
                
                if (error) {
                  summary.errors.push({ item: activity, error: error.message });
                } else {
                  summary.updated++;
                }
              } else {
                // Insert new record
                const { error } = await supabase
                  .from('special_activities')
                  .insert(activityData);
                
                if (error) {
                  summary.errors.push({ item: activity, error: error.message });
                } else {
                  summary.inserted++;
                }
              }
            }

            // Build summary message
            let message = `Import complete: ${summary.inserted} added, ${summary.updated} updated, ${summary.skipped} skipped`;
            if (summary.errors.length > 0) {
              message += `, ${summary.errors.length} errors`;
            }

            // Report unmatched teachers
            if (unmatchedTeachers.size > 0) {
              const unmatchedList = Array.from(unmatchedTeachers).join(', ');
              message += `\n\n⚠️ ${unmatchedTeachers.size} teacher(s) not found in database: ${unmatchedList}\n\nThese activities were imported with text-only teacher names. To link them to teacher records, add the teachers in the Admin > Teachers page first.`;
              console.warn("Unmatched teachers:", Array.from(unmatchedTeachers));
            }

            alert(message);

            if (summary.errors.length > 0) {
              console.error("Import errors:", summary.errors);
            }
            
            onSuccess();
          } catch (err: any) {
            console.error("Import error:", err);
            setError(err.message);
          } finally {
            setImporting(false);
          }
        },
        error: (err) => {
          setError(`CSV parsing error: ${err.message}`);
          setImporting(false);
        },
      });
    } catch (err: any) {
      setError(err.message);
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 border-2 border-dashed border-purple-300 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-12 w-12 text-purple-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M8 14v20c0 4.418 7.163 8 16 8 1.381 0 2.721-.087 4-.252M8 14c0 4.418 7.163 8 16 8s16-3.582 16-8M8 14c0-4.418 7.163-8 16-8s16 3.582 16 8m0 0v14m-16-4h.01M32 6.401V4.992c0-.552-.449-1-1.003-1H9.003C8.449 3.992 8 4.44 8 4.992v1.409"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mb-4">
          <p className="text-lg font-medium text-gray-900 mb-2">
            Upload Special Activities CSV
          </p>
          <p className="text-sm text-gray-600">
            CSV should include: Teacher, Activity, Day, Start Time, End Time
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Valid activities: {SPECIAL_ACTIVITY_TYPES.join(', ')}
          </p>
          <p className="text-xs text-gray-500">
            Time format: HH:MM (e.g., 9:00, 1:30 PM, or 14:30)
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={importing}
            className="hidden"
            id="special-csv-upload"
          />
          <label htmlFor="special-csv-upload">
            <span
              className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${importing ? "bg-gray-400" : "bg-purple-600 hover:bg-purple-700 cursor-pointer"}`}
            >
              {importing ? "Importing..." : "Choose File"}
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
