"use client";

import { useState } from "react";
import Papa from "papaparse";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "../../../src/types/database";
import { useSchool } from "../../components/providers/school-context";
import { dedupeSpecialActivities, normalizeSpecialActivity, createImportSummary } from '../../../lib/utils/dedupe-helpers';

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
Wilson,Art,Thursday,11:00,11:45
Garcia,Computer Lab,Friday,14:00,14:45`;

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

            const rawActivities = results.data
              .filter((row: any) => row.teacher && row.activity && row.day)
              .map((row: any) => ({
                teacher_name: row.teacher.trim(),
                activity_name: row.activity.trim(),
                day_of_week: dayNameToNumber(row.day),
                start_time: row['start time']?.trim() || '',
                end_time: row['end time']?.trim() || ''
              }));

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
              const activityData = {
                provider_id: user.user!.id,
                teacher_name: activity.teacher_name,
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

            const message = `Import complete: ${summary.inserted} added, ${summary.updated} updated, ${summary.skipped} skipped${summary.errors.length > 0 ? `, ${summary.errors.length} errors` : ''}`;
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
            Time format: HH:MM (24-hour format, e.g., 14:30 for 2:30 PM)
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
