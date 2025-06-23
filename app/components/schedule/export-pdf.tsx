"use client";

import { useState } from "react";
import {
  Student,
  ScheduleSession,
  BellSchedule,
  SpecialActivity,
} from "../../../src/types/database";

interface ExportPDFProps {
  students: Student[];
  sessions: ScheduleSession[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  providerName: string;
  weekOf: Date;
  userRole: string;
  seaProfiles?: Array<{ id: string; full_name: string }>; // SEA info for display
}

export function ExportPDF({
  students,
  sessions,
  bellSchedules,
  specialActivities,
  providerName,
  weekOf,
  userRole,
  seaProfiles = [],
}: ExportPDFProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [exportType, setExportType] = useState<"all" | "mine" | "sea">("all");

  function formatTime(time: string): string {
    const [hours, minutes] = time.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  const getFilteredSessions = () => {
    switch (exportType) {
      case "mine":
        return sessions.filter((s) => s.delivered_by !== "sea");
      case "sea":
        return sessions.filter((s) => s.delivered_by === "sea");
      case "all":
      default:
        return sessions;
    }
  };

  const getSeaName = (seaId: string | null): string => {
    if (!seaId) return "";
    const sea = seaProfiles.find((s) => s.id === seaId);
    return sea ? sea.full_name : "SEA";
  };

  const handleExport = async () => {
    setIsGenerating(true);

    try {
      const filteredSessions = getFilteredSessions();

      let content = `Weekly Schedule\n`;
      content += `Provider: ${providerName}\n`;
      content += `Week of: ${weekOf.toLocaleDateString()}\n`;

      if (exportType === "mine") {
        content += `Filter: My Sessions Only\n`;
      } else if (exportType === "sea") {
        content += `Filter: SEA Sessions Only\n`;
      } else {
        content += `Filter: All Sessions\n`;
      }

      content += `\n`;

      // Group sessions by day
      const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

      days.forEach((day, dayIndex) => {
        content += `\n${day}:\n`;
        const daySessions = filteredSessions.filter(
          (s) => s.day_of_week === dayIndex + 1,
        );
        daySessions.sort((a, b) => a.start_time.localeCompare(b.start_time));

        if (daySessions.length === 0) {
          content += `  No sessions scheduled\n`;
        } else {
          daySessions.forEach((session) => {
            const student = students.find((st) => st.id === session.student_id);
            if (student) {
              const deliveredBy =
                session.delivered_by === "sea"
                  ? `SEA${session.assigned_to_sea_id ? ` (${getSeaName(session.assigned_to_sea_id)})` : ""}`
                  : "RS";

              const completionStatus = session.completed_at ? " ✓" : "";

              content += `  ${formatTime(session.start_time)} - ${formatTime(session.end_time)}: ${student.initials} (${session.service_type}) [${deliveredBy}]${completionStatus}\n`;

              if (session.session_notes) {
                content += `    Notes: ${session.session_notes}\n`;
              }
            }
          });
        }
      });

      // Add summary statistics
      content += `\n\n--- SUMMARY ---\n`;
      content += `Total Sessions: ${filteredSessions.length}\n`;
      const mySessions = filteredSessions.filter(
        (s) => s.delivered_by !== "sea",
      ).length;
      const seaSessions = filteredSessions.filter(
        (s) => s.delivered_by === "sea",
      ).length;
      const completedSessions = filteredSessions.filter(
        (s) => s.completed_at,
      ).length;

      content += `My Sessions: ${mySessions}\n`;
      content += `SEA Sessions: ${seaSessions}\n`;
      content += `Completed Sessions: ${completedSessions}\n`;
      content += `Completion Rate: ${filteredSessions.length > 0 ? Math.round((completedSessions / filteredSessions.length) * 100) : 0}%\n`;

      // Create and download file
      const blob = new Blob([content], { type: "text/plain" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;

      const filterSuffix = exportType === "all" ? "" : `-${exportType}`;
      a.download = `schedule-${weekOf.toISOString().split("T")[0]}${filterSuffix}.txt`;

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating export:", error);
      alert("Failed to generate export. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Export Type Selector (only show for Resource Specialists) */}
      {userRole === "resource" && (
        <select
          value={exportType}
          onChange={(e) =>
            setExportType(e.target.value as "all" | "mine" | "sea")
          }
          className="px-3 py-2 border border-gray-300 rounded text-sm"
          disabled={isGenerating}
        >
          <option value="all">All Sessions</option>
          <option value="mine">My Sessions</option>
          <option value="sea">SEA Sessions</option>
        </select>
      )}

      <button
        onClick={handleExport}
        disabled={isGenerating}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
      >
        {isGenerating ? "Generating..." : "Export Schedule"}
      </button>
    </div>
  );
}
