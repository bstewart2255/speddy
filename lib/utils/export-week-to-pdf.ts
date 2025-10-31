import { jsPDF } from 'jspdf';

interface Student {
  initials: string;
  grade_level?: string;
}

interface Session {
  id: string;
  student_id: string | null;
  start_time: string | null;
  end_time: string | null;
  day_of_week: number | null;
  group_id: string | null;
  group_name: string | null;
}

interface WeekData {
  sessions: Session[];
  students: Map<string, Student>;
  weekDates: Date[]; // Array of 5 dates (Monday-Friday)
}

export function exportWeekToPDF(data: WeekData) {
  // Create landscape PDF
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10;
  const headerHeight = 15;
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Calculate column width (5 columns with margins)
  const columnWidth = (pageWidth - (margin * 2)) / 5;

  // Title
  doc.setFontSize(16);
  doc.text('Week Schedule', pageWidth / 2, margin + 5, { align: 'center' });

  // Group sessions by day
  const sessionsByDay: Map<number, Session[]> = new Map();
  for (let i = 1; i <= 5; i++) {
    sessionsByDay.set(i, []);
  }

  data.sessions.forEach(session => {
    if (session.day_of_week && session.start_time && session.end_time) {
      const daySessions = sessionsByDay.get(session.day_of_week) || [];
      daySessions.push(session);
      sessionsByDay.set(session.day_of_week, daySessions);
    }
  });

  // Sort sessions within each day by start time
  sessionsByDay.forEach((sessions, day) => {
    sessions.sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Draw day columns
  dayNames.forEach((dayName, index) => {
    const x = margin + (index * columnWidth);
    const y = margin + headerHeight;

    // Draw column border
    doc.setDrawColor(0);
    doc.setLineWidth(0.3);
    doc.rect(x, y, columnWidth, pageHeight - y - margin);

    // Day name header
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(dayName, x + columnWidth / 2, y + 7, { align: 'center' });

    // Draw separator line below day name
    doc.line(x, y + 10, x + columnWidth, y + 10);

    // Get sessions for this day (day_of_week is 1-based, index is 0-based)
    const dayOfWeek = index + 1;
    const daySessions = sessionsByDay.get(dayOfWeek) || [];

    // Group sessions by time slot and identify groups
    const timeSlotGroups = new Map<string, Session[]>();
    daySessions.forEach(session => {
      if (!session.start_time || !session.end_time) return;
      const timeSlot = `${session.start_time.substring(0, 5)}-${session.end_time.substring(0, 5)}`;
      if (!timeSlotGroups.has(timeSlot)) {
        timeSlotGroups.set(timeSlot, []);
      }
      timeSlotGroups.get(timeSlot)!.push(session);
    });

    // Render sessions
    let yPos = y + 15;
    const contentPadding = 2;
    const lineHeight = 4;

    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);

    timeSlotGroups.forEach((sessions, timeSlot) => {
      // Check if we have space, otherwise we'd need to handle overflow
      // For simplicity, we'll just continue rendering

      // Check if this is a group
      const isGroup = sessions.length > 1 && sessions[0].group_id;

      if (isGroup) {
        // Render as a group
        const groupName = sessions[0].group_name || 'Group';
        const studentInitials = sessions
          .map(s => data.students.get(s.student_id || '')?.initials || '?')
          .filter((v, i, a) => a.indexOf(v) === i) // unique
          .join(', ');

        // Group indicator box
        doc.setFillColor(240, 240, 240);
        const boxHeight = 15;
        doc.rect(x + contentPadding, yPos, columnWidth - (contentPadding * 2), boxHeight, 'FD');

        // Time
        doc.setFont(undefined, 'bold');
        doc.setFontSize(8);
        doc.text(formatTime(timeSlot.split('-')[0]), x + contentPadding + 1, yPos + 3);

        // Group name
        doc.setFont(undefined, 'normal');
        doc.setFontSize(9);
        doc.text(`📚 ${groupName}`, x + contentPadding + 1, yPos + 7);

        // Students
        doc.setFontSize(7);
        const studentsText = doc.splitTextToSize(studentInitials, columnWidth - (contentPadding * 2) - 2);
        doc.text(studentsText, x + contentPadding + 1, yPos + 11);

        yPos += boxHeight + 2;
      } else {
        // Render individual sessions
        sessions.forEach(session => {
          const student = data.students.get(session.student_id || '');
          const initials = student?.initials || '?';

          // Time
          doc.setFont(undefined, 'bold');
          doc.setFontSize(8);
          doc.text(formatTime(session.start_time!.substring(0, 5)), x + contentPadding + 1, yPos + 3);

          // Student initials
          doc.setFont(undefined, 'normal');
          doc.setFontSize(9);
          doc.text(initials, x + contentPadding + 1, yPos + 7);

          yPos += 10;
        });
      }
    });

    // Show "No sessions" if day is empty
    if (daySessions.length === 0) {
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('No sessions', x + columnWidth / 2, y + 25, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
  });

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, pageHeight - 5);
  doc.setTextColor(0, 0, 0);

  // Save the PDF
  const timestamp = new Date().toISOString().split('T')[0];
  doc.save(`week-schedule-${timestamp}.pdf`);
}

// Helper function to format time (HH:MM to h:MM AM/PM)
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
