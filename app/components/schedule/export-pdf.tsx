"use client";

import { useState } from "react";
import { ScheduleSession } from "../../../src/types/database";
import { exportWeekToPDF } from "@/lib/utils/export-week-to-pdf";
import { LongHoverTooltip } from "../ui/long-hover-tooltip";

interface ExportPDFProps {
  students: { id: string; initials: string }[];
  sessions: ScheduleSession[];
  weekDates: Date[];
}

export function ExportPDF({
  students,
  sessions,
  weekDates,
}: ExportPDFProps) {
  const [isPrinting, setIsPrinting] = useState(false);

  const handlePrint = () => {
    setIsPrinting(true);

    try {
      exportWeekToPDF({
        sessions,
        students,
        weekDates,
      });
    } catch (error) {
      console.error("Error generating print view:", error);
      alert("Failed to open print view. Please try again.");
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <LongHoverTooltip content="Print your weekly schedule as a one-page view. Opens a print dialog where you can save as PDF or send to printer.">
      <button
        onClick={handlePrint}
        disabled={isPrinting}
        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400 flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-4 w-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
          />
        </svg>
        {isPrinting ? "Opening..." : "Print Week"}
      </button>
    </LongHoverTooltip>
  );
}
