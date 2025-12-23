import { ScheduleSession } from '../../src/types/database';
import { filterScheduledSessions } from './session-helpers';

// View mode type matching calendar-week-view.tsx
type ViewMode = 'my-sessions' | 'all-sessions' | 'specialist' | 'sea' | 'assigned-to-me';

// Human-readable labels for view modes
const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  'my-sessions': 'My Sessions',
  'all-sessions': 'All Sessions',
  'specialist': 'Assigned to Specialist',
  'sea': 'Assigned to SEA',
  'assigned-to-me': 'Assigned to Me',
};

// Minimal student interface - just what we need for the export
interface StudentForExport {
  id: string;
  initials: string;
}

interface WeekExportData {
  sessions: ScheduleSession[];
  students: StudentForExport[];
  weekDates: Date[]; // Array of 5 dates (Monday-Friday)
  viewMode?: ViewMode; // Optional - defaults to 'my-sessions'
}

export function exportWeekToPDF(data: WeekExportData) {
  const viewMode = data.viewMode || 'my-sessions'; // Default to my-sessions
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  // Create students map for quick lookup
  const studentsMap = new Map<string, StudentForExport>();
  data.students.forEach(student => {
    studentsMap.set(student.id, student);
  });

  // Filter for only scheduled sessions
  const scheduledSessions = filterScheduledSessions(data.sessions);

  // Group sessions by day
  const sessionsByDay: Map<number, ScheduleSession[]> = new Map();
  for (let i = 1; i <= 5; i++) {
    sessionsByDay.set(i, []);
  }

  scheduledSessions.forEach(session => {
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

  // Format week header
  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const weekHeader = data.weekDates.length >= 5
    ? `${formatDateShort(data.weekDates[0])} - ${formatDateShort(data.weekDates[4])}`
    : 'Week Schedule';

  // Generate HTML for printing
  const printContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Week Schedule</title>
      <style>
        @media print {
          @page {
            size: landscape;
            margin: 0.5in;
          }
          body {
            margin: 0;
            padding: 0 !important;
          }
        }

        * {
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          padding: 20px;
          margin: 0;
        }

        h1 {
          text-align: center;
          margin: 0 0 16px 0;
          font-size: 20px;
          font-weight: 600;
        }

        .week-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 8px;
          height: calc(100vh - 80px);
        }

        .day-column {
          border: 1px solid #d1d5db;
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }

        .day-header {
          background-color: #f3f4f6;
          padding: 8px;
          text-align: center;
          font-weight: 600;
          font-size: 13px;
          border-bottom: 1px solid #d1d5db;
          flex-shrink: 0;
        }

        .day-date {
          font-size: 11px;
          font-weight: 400;
          color: #6b7280;
        }

        .day-content {
          padding: 8px;
          flex: 1;
          overflow-y: auto;
        }

        .session-item {
          margin-bottom: 8px;
          padding-bottom: 8px;
          border-bottom: 1px solid #e5e7eb;
        }

        .session-item:last-child {
          border-bottom: none;
          margin-bottom: 0;
          padding-bottom: 0;
        }

        .session-time {
          font-size: 11px;
          color: #6b7280;
          margin-bottom: 2px;
        }

        .session-student {
          font-size: 13px;
          font-weight: 500;
        }

        .no-sessions {
          color: #9ca3af;
          text-align: center;
          padding: 20px 8px;
          font-size: 12px;
        }

        .view-mode-label {
          text-align: center;
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 12px;
        }

        /* Shape styles for session type differentiation */
        .shape-square {
          display: inline-block;
          border: 1.5px solid #333;
          padding: 0 3px;
          margin: 0 1px;
        }

        .shape-circle {
          display: inline-block;
          border: 1.5px solid #333;
          border-radius: 50%;
          padding: 0 4px;
          margin: 0 1px;
        }

        /* Legend styles - displayed in header area */
        .legend {
          font-size: 10px;
          text-align: center;
          color: #374151;
          margin-bottom: 12px;
        }

        .legend-item {
          display: inline-block;
          margin: 0 8px;
        }
      </style>
    </head>
    <body>
      <h1>Week of ${weekHeader}</h1>
      <div class="view-mode-label">View: ${VIEW_MODE_LABELS[viewMode]}</div>
      ${viewMode === 'all-sessions' ? `
        <div class="legend">
          <span class="legend-item"><span class="shape-square">AB</span> = Assigned to SEA</span>
          <span class="legend-item"><span class="shape-circle">AB</span> = Assigned to Specialist</span>
          <span class="legend-item">AB = My Sessions</span>
        </div>
      ` : ''}
      <div class="week-grid">
        ${dayNames.map((dayName, index) => {
          const dayOfWeek = index + 1;
          const daySessions = sessionsByDay.get(dayOfWeek) || [];
          const dayDate = data.weekDates[index];

          const dateStr = dayDate
            ? dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : '';

          let sessionsHtml = '';

          if (daySessions.length === 0) {
            sessionsHtml = '<div class="no-sessions">No sessions</div>';
          } else {
            // Group sessions by time slot to combine group sessions
            // Store session objects along with initials for shape rendering
            interface SessionEntry {
              initials: string;
              session: ScheduleSession;
            }
            const timeSlotMap = new Map<string, SessionEntry[]>();

            daySessions.forEach(session => {
              const timeKey = session.start_time!;
              const student = studentsMap.get(session.student_id || '');
              const initials = student?.initials || '?';

              if (!timeSlotMap.has(timeKey)) {
                timeSlotMap.set(timeKey, []);
              }
              const entries = timeSlotMap.get(timeKey)!;
              // Avoid duplicate initials in same time slot
              if (!entries.some(e => e.initials === initials)) {
                entries.push({ initials, session });
              }
            });

            // Sort time slots and render
            const sortedTimeSlots = Array.from(timeSlotMap.entries()).sort((a, b) =>
              a[0].localeCompare(b[0])
            );

            sortedTimeSlots.forEach(([timeKey, entries]) => {
              // Render initials with shapes for all-sessions view
              const initialsHtml = entries.map(entry => {
                return renderInitialsWithShape(entry.initials, entry.session, viewMode);
              }).join(', ');

              sessionsHtml += `
                <div class="session-item">
                  <div class="session-time">${formatTime(timeKey)}</div>
                  <div class="session-student">${initialsHtml}</div>
                </div>
              `;
            });
          }

          return `
            <div class="day-column">
              <div class="day-header">
                ${dayName}
                ${dateStr ? `<div class="day-date">${dateStr}</div>` : ''}
              </div>
              <div class="day-content">
                ${sessionsHtml}
              </div>
            </div>
          `;
        }).join('')}
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

// Helper function to format time (HH:MM:SS to h:MM AM/PM)
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
  return `${displayHour}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}

// Helper function to render initials with shapes based on assignment type
// Only applies shapes in "all-sessions" view
function renderInitialsWithShape(
  initials: string,
  session: ScheduleSession,
  viewMode: ViewMode
): string {
  // Only apply shapes in all-sessions view
  if (viewMode !== 'all-sessions') {
    return initials;
  }

  if (session.assigned_to_sea_id) {
    // Square shape for sessions assigned to SEA
    return `<span class="shape-square">${initials}</span>`;
  } else if (session.assigned_to_specialist_id) {
    // Circle shape for sessions assigned to Specialist
    return `<span class="shape-circle">${initials}</span>`;
  }
  // Plain text for sessions I own and deliver (no assignment)
  return initials;
}
