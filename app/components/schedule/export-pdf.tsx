'use client';

import { useState } from 'react';
import { Student, ScheduleSession, BellSchedule, SpecialActivity } from '../../../src/types/database';

interface ExportPDFProps {
  students: Student[];
  sessions: ScheduleSession[];
  bellSchedules: BellSchedule[];
  specialActivities: SpecialActivity[];
  providerName: string;
  weekOf: Date;
}

export function ExportPDF({ 
  students, 
  sessions, 
  bellSchedules, 
  specialActivities,
  providerName,
  weekOf 
}: ExportPDFProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  function formatTime(time: string): string {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  }

  const handleExport = async () => {
    setIsGenerating(true);

    try {
      // For now, let's create a simple text schedule
      let content = `Weekly Schedule\n`;
      content += `Provider: ${providerName}\n`;
      content += `Week of: ${weekOf.toLocaleDateString()}\n\n`;

      // Group sessions by day
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

      days.forEach((day, dayIndex) => {
        content += `\n${day}:\n`;
        const daySessions = sessions.filter(s => s.day_of_week === dayIndex + 1);
        daySessions.sort((a, b) => a.start_time.localeCompare(b.start_time));

        daySessions.forEach(session => {
          const student = students.find(st => st.id === session.student_id);
          if (student) {
            content += `  ${formatTime(session.start_time)} - ${formatTime(session.end_time)}: ${student.initials} (${session.service_type})\n`;
          }
        });

        if (daySessions.length === 0) {
          content += `  No sessions scheduled\n`;
        }
      });

      // Create and download file
      const blob = new Blob([content], { type: 'text/plain' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `schedule-${weekOf.toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      console.error('Error generating export:', error);
      alert('Failed to generate export. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={isGenerating}
      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-gray-400"
    >
      {isGenerating ? 'Generating...' : 'Export Schedule'}
    </button>
  );
}