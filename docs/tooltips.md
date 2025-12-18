# Speddy Tooltip System

This document defines all action buttons in the app and their tooltip descriptions. These tooltips will appear after a 5-second hover delay to provide detailed help without interrupting quick interactions.

---

## Schedule Page

### Main Actions

| Button                 | File                   | Tooltip                                                                                                                                        |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto-Schedule Sessions | `schedule-header.tsx`  | Automatically schedule all unscheduled sessions based on student availability and scheduling constraints. This process may take a few moments. |
| Undo Schedule          | `undo-schedule.tsx`    | Revert the last scheduling action. This will restore sessions to their previous state before the most recent auto-schedule or manual change.   |
| Clear Day              | `clear-day-button.tsx` | Remove all sessions from this day. Sessions will return to the unscheduled pool and can be rescheduled later.                                  |
| Re-schedule All        | `_reschedule-all.tsx`  | Clear the entire schedule and rebuild from scratch using the auto-scheduler. Warning: This cannot be undone.                                   |
| Export Schedule        | `export-pdf.tsx`       | Download your schedule as a text file. Choose to export all sessions or filter by provider type.                                               |

### Filters

| Button              | File                    | Tooltip                                                                                      |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------- |
| All Sessions        | `schedule-controls.tsx` | Show all scheduled sessions across all providers and service types.                          |
| My Sessions         | `schedule-controls.tsx` | Show only sessions assigned to you. Useful for viewing your personal caseload.               |
| SEA Sessions        | `schedule-controls.tsx` | Show sessions assigned to Special Education Aides.                                           |
| Specialist Sessions | `schedule-controls.tsx` | Show sessions for specialists (OT, Speech, Counseling, etc.).                                |
| Assigned Sessions   | `schedule-controls.tsx` | Show only sessions that have been assigned to a provider.                                    |
| Grade Level Filter  | `schedule-controls.tsx` | Filter sessions by student grade level. Click to toggle visibility of that grade's sessions. |
| Clear Highlight     | `schedule-controls.tsx` | Remove the highlight from the currently selected student and show all sessions.              |
| Remove Filter Tag   | `schedule-controls.tsx` | Remove this active filter and return to showing all sessions.                                |

---

## Students Page

| Button           | File                | Tooltip                                                                                                                   |
| ---------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Import CSV       | `students/page.tsx` | Import multiple students at once from a CSV file. Download the template first to ensure correct formatting.               |
| File Upload      | `students/page.tsx` | Upload student data files using the guided import wizard. Supports various file formats.                                  |
| Add Student      | `students/page.tsx` | Add a new student to your caseload. You'll need their name, grade, teacher, and service requirements.                     |
| Close Add Form   | `students/page.tsx` | Close the add student form without saving. Any entered data will be lost.                                                 |
| Edit Student     | `students/page.tsx` | Edit this student's information including name, grade, teacher assignment, and service details.                           |
| Delete Student   | `students/page.tsx` | Permanently remove this student from your caseload. This action cannot be undone and will delete all associated sessions. |
| Save Student     | `students/page.tsx` | Save changes to this student's information.                                                                               |
| Cancel Edit      | `students/page.tsx` | Discard changes and return to view mode without saving.                                                                   |
| Student Initials | `students/page.tsx` | Click to view detailed information about this student including their services, goals and other info.                     |
| Teacher Name     | `students/page.tsx` | Click to view information about this teacher and other students in their class.                                           |
| Sort by Grade    | `students/page.tsx` | Group students by grade level for easier navigation. Uncheck to sort alphabetically.                                      |

---

## Admin - Teacher Directory

| Button         | File                      | Tooltip                                                                                                                |
| -------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reset Password | `admin/teachers/page.tsx` | Reset a teacher's password by generating a new one. Then share the new one with them so they can access their account. |
| Delete Teacher | `admin/teachers/page.tsx` | Remove this teacher from the system. Note: Teachers with active accounts can not deleted.                              |

---

## Admin - Provider Directory

| Button         | File                       | Tooltip                                                                                               |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| Add Provider   | `admin/providers/page.tsx` | Create a new provider account. A password will be generated that you can share with them.             |
| Reset Password | `admin/providers/page.tsx` | Reset the password of a provider. You can share the new password with them after it's been generated. |

---

## Navigation

| Button          | File                        | Tooltip                                                                                                         |
| --------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Help            | `navbar.tsx`                | Open the help chat to get assistance with using Speddy. Our support team typically responds within a few hours. |
| User Profile    | `user-profile-dropdown.tsx` | Access your account settings, preferences, and sign out option.                                                 |
| Settings        | `user-profile-dropdown.tsx` | Manage your account settings and personal information.                                                          |
| Sign Out        | `user-profile-dropdown.tsx` | Log out of your Speddy account. You'll need to sign in again to access your data.                               |
| School Switcher | `school-switcher.tsx`       | Switch between schools if you work at multiple locations. Your primary school is marked with a badge.           |

---

## Data Import/Export

| Button                | File             | Tooltip                                                                                  |
| --------------------- | ---------------- | ---------------------------------------------------------------------------------------- |
| Download CSV Template | `csv-import.tsx` | Download a properly formatted CSV template with all required columns for student import. |

---

## Calendar & Lessons

| Button        | File                           | Tooltip                                                                  |
| ------------- | ------------------------------ | ------------------------------------------------------------------------ |
| Print Lesson  | `manual-lesson-view-modal.tsx` | Print this lesson plan for offline use or documentation.                 |
| Edit Lesson   | `manual-lesson-view-modal.tsx` | Modify this lesson plan including objectives, activities, and materials. |
| Delete Lesson | `manual-lesson-view-modal.tsx` | Permanently remove this lesson plan. This action cannot be undone.       |

---

## Modal & Form Buttons

| Button           | File                         | Tooltip                                                                                         |
| ---------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| Cancel           | Various                      | Discard any changes and close this form.                                                        |
| Save/Submit      | Various                      | Save your changes and close this form.                                                          |
| Keep Unscheduled | `manual-placement-modal.tsx` | Leave this session unscheduled to avoid the conflict. You can manually place it later.          |
| Place Anyway     | `manual-placement-modal.tsx` | Schedule this session despite the conflict. The conflicting session will be flagged for review. |

---

## Todo Widget

| Button        | File              | Tooltip                                                                    |
| ------------- | ----------------- | -------------------------------------------------------------------------- |
| Delete Task   | `todo-widget.tsx` | Remove this task from your to-do list.                                     |
| Complete Task | `todo-widget.tsx` | Mark this task as complete. It will be moved to your completed tasks list. |

---

## Implementation Notes

- **Delay**: 5 seconds for all tooltips
- **Design System**: Use z-index 1150 (already defined in `lib/styles/tokens.ts`)
- **Positioning**: Tooltips should appear above/below the element and stay within viewport bounds
- **Animation**: Fade in using CSS transitions
