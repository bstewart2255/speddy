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
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

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
  sessionsByDay.forEach((sessions) => {
    sessions.sort((a, b) => {
      if (!a.start_time || !b.start_time) return 0;
      return a.start_time.localeCompare(b.start_time);
    });
  });

  // Generate HTML for printing
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Week Schedule - ${new Date().toLocaleDateString()}</title>
      <style>
        @media print {
          @page {
            size: landscape;
            margin: 0.5in;
          }
          body {
            margin: 0;
            padding: 0;
          }
        }

        body {
          font-family: Arial, sans-serif;
          padding: 20px;
        }

        h1 {
          text-align: center;
          margin: 0 0 20px 0;
          font-size: 24px;
        }

        .week-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }

        .day-column {
          border: 1px solid #333;
          min-height: 400px;
        }

        .day-header {
          background-color: #f0f0f0;
          padding: 10px;
          text-align: center;
          font-weight: bold;
          border-bottom: 2px solid #333;
          font-size: 14px;
        }

        .day-content {
          padding: 8px;
        }

        .session-item {
          margin-bottom: 8px;
          page-break-inside: avoid;
        }

        .session-time {
          font-weight: bold;
          font-size: 11px;
          color: #333;
        }

        .session-student {
          font-size: 12px;
          margin-top: 2px;
        }

        .group-session {
          background-color: #f5f5f5;
          padding: 6px;
          border-radius: 4px;
          margin-bottom: 8px;
          page-break-inside: avoid;
        }

        .group-name {
          font-size: 12px;
          margin-top: 2px;
        }

        .group-students {
          font-size: 10px;
          color: #666;
          margin-top: 2px;
        }

        .no-sessions {
          color: #999;
          text-align: center;
          padding: 20px;
          font-size: 11px;
        }

        .footer {
          text-align: center;
          color: #666;
          font-size: 10px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <h1>Week Schedule</h1>
      <div class="week-grid">
        ${dayNames.map((dayName, index) => {
          const dayOfWeek = index + 1;
          const daySessions = sessionsByDay.get(dayOfWeek) || [];

          // Group sessions by time slot
          const timeSlotGroups = new Map<string, Session[]>();
          daySessions.forEach(session => {
            if (!session.start_time || !session.end_time) return;
            const timeSlot = `${session.start_time.substring(0, 5)}-${session.end_time.substring(0, 5)}`;
            if (!timeSlotGroups.has(timeSlot)) {
              timeSlotGroups.set(timeSlot, []);
            }
            timeSlotGroups.get(timeSlot)!.push(session);
          });

          let sessionsHtml = '';

          if (daySessions.length === 0) {
            sessionsHtml = '<div class="no-sessions">No sessions</div>';
          } else {
            timeSlotGroups.forEach((sessions, timeSlot) => {
              const isGroup = sessions.length > 1 && sessions[0].group_id;

              if (isGroup) {
                const groupName = sessions[0].group_name || 'Group';
                const studentInitials = sessions
                  .map(s => data.students.get(s.student_id || '')?.initials || '?')
                  .filter((v, i, a) => a.indexOf(v) === i)
                  .join(', ');

                sessionsHtml += `
                  <div class="group-session">
                    <div class="session-time">${formatTime(timeSlot.split('-')[0])}</div>
                    <div class="group-name">📚 ${groupName}</div>
                    <div class="group-students">${studentInitials}</div>
                  </div>
                `;
              } else {
                sessions.forEach(session => {
                  const student = data.students.get(session.student_id || '');
                  const initials = student?.initials || '?';

                  sessionsHtml += `
                    <div class="session-item">
                      <div class="session-time">${formatTime(session.start_time!.substring(0, 5))}</div>
                      <div class="session-student">${initials}</div>
                    </div>
                  `;
                });
              }
            });
          }

          return `
            <div class="day-column">
              <div class="day-header">${dayName}</div>
              <div class="day-content">
                ${sessionsHtml}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="footer">
        Generated on ${new Date().toLocaleDateString()}
      </div>
    </body>
    </html>
  `;

  // Open print dialog
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();

    // Wait for content to load, then print
    printWindow.onload = () => {
      printWindow.print();
      // Close window after printing (user can cancel)
      printWindow.onafterprint = () => {
        printWindow.close();
      };
    };
  }
}

// Helper function to format time (HH:MM to h:MM AM/PM)
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
