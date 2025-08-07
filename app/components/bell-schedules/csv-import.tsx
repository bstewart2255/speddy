"use client";

import { useState } from "react";
import Papa from "papaparse";
import { createClient } from '@/lib/supabase/client';
import type { Database } from "../../../src/types/database";
import { useSchool } from "../../components/providers/school-context";

interface Props {
  onSuccess: () => void;
}

export default function BellScheduleCSVImport({ onSuccess }: Props) {
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const supabase = createClient<Database>();
  const { currentSchool } = useSchool();

  const downloadTemplate = () => {
    const csvContent = `Grade,Activity,Start Time,End Time
K,Morning Meeting,08:00,08:30
K,Recess,10:00,10:15
1,Recess,10:30,10:45
2,Lunch,12:00,12:45
3,PE,13:00,13:45
4,Library,14:00,14:45
5,Music,09:00,09:45`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Bell_Schedule_Template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const validateColumns = (data: any[]) => {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];
    const headers = Object.keys(firstRow).map((h) => h.toLowerCase().trim());

    const requiredColumns = ["grade", "activity", "start time", "end time"];
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
      console.log("Found headers:", headers);
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
                "CSV missing required columns. Expected: Grade, Activity, Start Time, End Time",
              );
            }

            const schedules = results.data
              .filter((row: any) => row.grade && row.activity)
              .flatMap((row: any) => {
                // Create entries for each day of the week (Monday-Friday)
                return [1, 2, 3, 4, 5].map((dayNum) => ({
                  provider_id: user.user!.id,
                  grade_level: row.grade.toString().toUpperCase().trim(),
                  period_name: row.activity,
                  day_of_week: dayNum,
                  start_time: row["start time"] + ":00", // Add seconds if missing
                  end_time: row["end time"] + ":00",
                  school_id: currentSchool?.school_id, // Use school_id instead of school_site
                }));
              });

            console.log("Schedules to insert:", schedules);

            if (schedules.length > 0) {
              const { error: insertError } = await supabase
                .from("bell_schedules")
                .insert(schedules);

              if (insertError) {
                console.error("Insert error:", insertError);
                throw insertError;
              }

              alert(
                `Successfully imported ${schedules.length / 5} bell schedules (applied to all weekdays)!`,
              );
              onSuccess();
            } else {
              throw new Error("No valid schedules found in CSV");
            }
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
      <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-8 text-center">
        <div className="mb-4">
          <svg
            className="mx-auto h-12 w-12 text-blue-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="mb-4">
          <p className="text-lg font-medium text-gray-900 mb-2">
            Upload Bell Schedule CSV
          </p>
          <p className="text-sm text-gray-600">
            CSV should include: Grade, Activity, Start Time, End Time
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Time format: HH:MM (24-hour format, e.g., 14:30 for 2:30 PM)
          </p>
          <p className="text-xs text-gray-500">
            Schedules will be applied to all weekdays (Monday-Friday)
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={importing}
            className="hidden"
            id="bell-csv-upload"
          />
          <label htmlFor="bell-csv-upload">
            <span
              className={`inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${importing ? "bg-gray-400" : "bg-blue-600 hover:bg-blue-700 cursor-pointer"}`}
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
