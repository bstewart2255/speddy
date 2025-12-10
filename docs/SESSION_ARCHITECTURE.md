# Session Architecture

This document describes the session data model and how sessions flow through the system.

## Overview

The session system uses a **template-instance pattern** where recurring weekly sessions are defined as templates, and actual dated occurrences are generated as instances.

## Data Model

### Session Types

All sessions are stored in the `schedule_sessions` table. The session type is determined by field values:

| Type                     | `session_date` | `day_of_week`   | Description                                           |
| ------------------------ | -------------- | --------------- | ----------------------------------------------------- |
| **Scheduled Template**   | `NULL`         | `0-4` (Mon-Fri) | Recurring weekly slot on the Main Schedule grid       |
| **Unscheduled Template** | `NULL`         | `NULL`          | Slot awaiting placement (in Unscheduled panel)        |
| **Dated Instance**       | `2024-12-10`   | `0-4`           | Actual dated occurrence for Calendar/Today's Schedule |

### Key Fields

```sql
schedule_sessions
├── id                  -- UUID primary key
├── student_id          -- FK to students
├── provider_id         -- FK to profiles
├── session_date        -- NULL for templates, DATE for instances
├── day_of_week         -- 0-4 (Mon-Fri), NULL if unscheduled
├── start_time          -- TIME, NULL if unscheduled
├── end_time            -- TIME, NULL if unscheduled
├── is_completed        -- Only valid for dated instances (see constraint)
├── status              -- 'active' | 'needs_attention' | 'conflict'
├── has_conflict        -- Boolean flag for conflict detection
└── ...
```

### Constraints

```sql
-- Only dated instances can be marked as completed
-- Templates should never be "completed"
CONSTRAINT chk_completion_only_for_dated_instances
CHECK (is_completed = false OR session_date IS NOT NULL)
```

## Critical Invariant

```
scheduled_templates + unscheduled_templates = sessions_per_week
```

For any student with `sessions_per_week` set, the total number of templates must equal that value.

**Verification Query:**

```sql
SELECT
  s.initials,
  s.sessions_per_week as required,
  COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false) as scheduled,
  COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL) as unscheduled,
  COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
  + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL) as total
FROM students s
LEFT JOIN schedule_sessions ss ON ss.student_id = s.id
WHERE s.sessions_per_week IS NOT NULL AND s.sessions_per_week > 0
GROUP BY s.id, s.initials, s.sessions_per_week
HAVING s.sessions_per_week != (
  COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NOT NULL AND ss.is_completed = false)
  + COUNT(ss.id) FILTER (WHERE ss.session_date IS NULL AND ss.day_of_week IS NULL)
);
-- Should return 0 rows if invariant holds
```

## Data Flow

### 1. Student Created

```
Student created with sessions_per_week = 3
    ↓
3 unscheduled templates created (session_date=NULL, day_of_week=NULL)
    ↓
Templates appear in "Unscheduled Sessions" panel
```

### 2. Session Scheduled (drag to grid or auto-schedule)

```
Unscheduled template
    ↓
UPDATE: day_of_week, start_time, end_time set
    ↓
Becomes scheduled template (appears on Main Schedule grid)
    ↓
Dated instances generated for upcoming weeks
```

### 3. Instance Generation

```
Scheduled template (e.g., Monday 9:00-9:30)
    ↓
Generate instances for next 8 weeks
    ↓
Dated instances created (e.g., 2024-12-09, 2024-12-16, ...)
    ↓
Instances appear in Calendar view and Today's Schedule
```

### 4. Session Delivery

```
Dated instance for today
    ↓
Provider marks as completed
    ↓
is_completed = true, completed_at = NOW()
```

## Where Sessions Appear

| UI Location            | Session Type          | Query Filter                                       |
| ---------------------- | --------------------- | -------------------------------------------------- |
| **Main Schedule Grid** | Scheduled Templates   | `session_date IS NULL AND day_of_week IS NOT NULL` |
| **Unscheduled Panel**  | Unscheduled Templates | `session_date IS NULL AND day_of_week IS NULL`     |
| **Calendar View**      | Dated Instances       | `session_date IS NOT NULL`                         |
| **Today's Schedule**   | Today's Instances     | `session_date = CURRENT_DATE`                      |
| **Day View**           | Day's Instances       | `session_date = :selected_date`                    |

## Common Operations

### Updating sessions_per_week

When `sessions_per_week` changes:

- **Increase**: Create additional unscheduled templates
- **Decrease**: Delete excess templates (unscheduled first, then scheduled)

Code: `lib/scheduling/session-requirement-sync.ts` → `adjustSessionCount()`

### Auto-Scheduling

When auto-scheduling sessions:

1. Find unscheduled templates for selected students
2. Find available time slots
3. UPDATE templates (set day_of_week, start_time, end_time)
4. Generate dated instances for scheduled templates

Code: `lib/scheduling/optimized-scheduler.ts`

### Conflict Detection

Sessions with scheduling conflicts:

- `status = 'needs_attention'`
- `has_conflict = true`
- `conflict_reason` describes the issue

Code: `lib/scheduling/session-requirement-sync.ts` → `detectSessionConflicts()`

## Helper Function

Use this to check if a session is scheduled:

```typescript
// lib/utils/session-helpers.ts
export function isScheduledSession(session: ScheduleSession): boolean {
  return session.day_of_week !== null && session.start_time !== null && session.end_time !== null;
}
```

## Historical Context

- **Nov 2024**: Instance-based model introduced (templates + dated instances)
- **Dec 8, 2024**: Bug - backfill only counted `status='active'` sessions
- **Dec 9, 2024**: Bug - cleanup deleted templates instead of excess sessions
- **Dec 10, 2024**: Fix - restored templates, added `has_conflict` column

See: GitHub Issue #440 for Dec 2024 data corruption incident.
