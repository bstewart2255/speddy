# Calendar Day View - Data Flow Analysis

## Overview

The Calendar Day view is a provider-facing interface that displays sessions for a specific date. It includes session management features like grouping and displays assignments for cross-provider sessions.

## Component Structure

### Main Entry Point

- **File**: `/home/runner/workspace/app/(dashboard)/dashboard/calendar/page.tsx`
- **Component**: `CalendarPage` (client-side)
- Manages view switching (day/week/month) and data fetching for all views

### Day View Component

- **File**: `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx`
- **Component**: `CalendarDayView` (client-side)
- Displays sessions for a single date with grouping, assignment badges, and time slot organization

---

## Data Fetching Flow

### 1. Calendar Page Level (`page.tsx` lines 120-283)

**Primary Data Fetch** (`fetchData` function):

```
1. Get authenticated user
2. Get user profile (role, school context)
3. Query sessions:
   - Filter by provider_id = current user
   - Filter by school_site and school_district (current school context)
   - Inner join on students table to validate student school context
4. Query students:
   - Filter by provider_id = current user
   - Filter by school_site and school_district
5. Build student map for ID lookup
6. Fetch calendar events using school context
7. Fetch holidays using school context
```

**Key Query Location**: Lines 148-177

```typescript
// Sessions query with inner join to validate student belongs to current school
let sessionQuery = supabase
  .from('schedule_sessions')
  .select(
    `
    *,
    students!inner(
      school_id,
      district_id,
      school_site,
      school_district
    )
  `
  )
  .eq('provider_id', user.id);

// Apply school filter
if (currentSchool) {
  const schoolSite = currentSchool.school_site ?? (currentSchool as any).site;
  const schoolDistrict = currentSchool.school_district ?? (currentSchool as any).district;

  if (schoolSite && schoolDistrict) {
    sessionQuery = sessionQuery
      .eq('students.school_site', schoolSite)
      .eq('students.school_district', schoolDistrict);
  }
}

const { data: sessionData } = await sessionQuery;
```

**Result**: Sessions array passed to CalendarDayView component

---

### 2. Calendar Day View Level (`calendar-day-view.tsx` lines 94-124)

**Session Loading** (within useEffect):

```
1. Get authenticated user
2. Get user profile (role) - used for delivered_by validation
3. Call sessionGenerator.getSessionsForDateRange(
     userId,
     currentDate,
     currentDate
   )
4. Set sessionsState
```

**Important**: The Day view makes its OWN query independently:

- Lines 114-118: Calls `sessionGenerator.getSessionsForDateRange()`
- Does NOT use sessions passed from parent component
- Only uses parent's students map for display purposes

---

## Session Generator Service

**File**: `/home/runner/workspace/lib/services/session-generator.ts`

### Method: `getSessionsForDateRange(providerId, startDate, endDate)`

**Query Strategy**:

1. **First Query** (Lines 22-28): Fetch instance sessions

```typescript
const { data: instances } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId)
  .gte('session_date', startDate.toISOString().split('T')[0])
  .lte('session_date', endDate.toISOString().split('T')[0])
  .not('session_date', 'is', null);
```

- Returns sessions where `session_date IS NOT NULL`
- These are specific session instances for specific dates

2. **Second Query** (Lines 31-35): Fetch template sessions

```typescript
const { data: templates } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId)
  .is('session_date', null);
```

- Returns sessions where `session_date IS NULL`
- These are recurring templates (Main Schedule)

3. **Generate Instances** (Lines 45-73):

- For each day in date range:
  - Calculate day_of_week
  - Find templates matching that day of week
  - For each template, check if instance already exists
  - If not, create temporary instance (temp-\* ID)
  - Add to sessions array

**Critical Limitation**: ONLY queries sessions where `provider_id = providerId`

- Does NOT include sessions assigned to this user as a specialist/SEA
- Only returns provider's own sessions

---

## Assigned Sessions - Current Limitation

### The Problem

The Calendar Day view does NOT show sessions assigned to the logged-in user as a specialist or SEA, even though:

1. The assignments exist in the database (`assigned_to_specialist_id`, `assigned_to_sea_id`)
2. Other parts of the app display these assignments (e.g., schedule page)
3. The assignment badge display logic exists (lines 612-639 of calendar-day-view.tsx)

### Evidence of Assignment Logic Elsewhere

**File**: `/home/runner/workspace/lib/supabase/hooks/use-schedule-data.ts` (Lines 153-157)

The schedule page hook DOES include assigned sessions:

```typescript
if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(profile.role)) {
  sessionsQuery = sessionsQuery.or(
    `provider_id.eq.${user.id},assigned_to_specialist_id.eq.${user.id}`
  );
} else {
  sessionsQuery = sessionsQuery.eq('provider_id', user.id);
}
```

This query:

- Includes sessions where user is provider_id (their own sessions)
- OR assigned_to_specialist_id = user (for specialists)
- OR assigned_to_sea_id = user (for SEAs) - see lines 354-361 for real-time subscribe

### Why Calendar Day View Doesn't Show Assigned Sessions

1. `SessionGenerator.getSessionsForDateRange()` only queries `provider_id`
2. It does not accept role parameter to adjust query
3. Calendar Day View calls SessionGenerator directly (line 114)
4. SessionGenerator has no logic to check assigned*to*\* fields

### Real-Time Subscriptions

Calendar Page sets up subscriptions (lines 322-368 of page.tsx):

- Line 328: Subscribes to `provider_id=eq.${data.currentUserId}`
- Line 344: For specialists, also subscribes to `assigned_to_specialist_id=eq.${data.currentUserId}`
- Line 361: For SEAs, also subscribes to `assigned_to_sea_id=eq.${data.currentUserId}`

However, these subscriptions trigger full data refetch, which still uses incomplete query.

---

## Filtering Logic in Calendar Day View

### Display Filtering (Lines 155-158)

```typescript
const filteredSessions = useMemo(
  () => sessionsState.filter(s => students.has(s.student_id)),
  [sessionsState, students]
);
```

**Logic**: Only display sessions where student is in the current school's student map

**Connection to Parent Data**:

- `students` map comes from parent Calendar Page component
- Parent queries students filtered by current school
- Ensures Day view only shows sessions for students at selected school

### Grouping Permission Check (Lines 84-91)

```typescript
const canUserGroupSession = (session: ScheduleSession): boolean => {
  if (!userProfile?.role) return false;

  // Map user role to delivered_by value using centralized function
  const expectedDeliveredBy = normalizeDeliveredBy(userProfile.role);

  return session.delivered_by === expectedDeliveredBy;
};
```

**Logic**: Only allow grouping sessions where user's role matches session's `delivered_by`

### Assignment Badge Logic (Lines 612-639)

```typescript
// Check if this is a cross-provider assignment:
// 1. Session belongs to another provider
// 2. Current user's role matches the delivered_by (they're assigned to deliver it)
const isAssignedToMe = session.provider_id !== providerId && canUserGroupSession(session);

if (isAssignedToMe) {
  // Display "Assigned" badge
  return (
    <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
      Assigned
    </span>
  );
}
```

**Critical Issue**: This logic checks if:

1. Session provider_id is different from current user ID
2. Current user's role matches `delivered_by`

But the session won't even be in `sessionsState` unless it's provider's own session!

---

## Role-to-DeliveredBy Mapping

**File**: `/home/runner/workspace/lib/auth/role-utils.ts`

```typescript
export function normalizeDeliveredBy(role: string): DeliveredByRole {
  if (role === 'sea') {
    return 'sea';
  }

  if (['specialist', 'speech', 'ot', 'counseling'].includes(role)) {
    return 'specialist';
  }

  // Default to 'provider' for 'provider', 'resource', 'admin', etc.
  return 'provider';
}
```

**Used in**:

1. Calendar Day View: Grouping permission check (line 88)
2. Scheduling coordinator: Session creation
3. Auto-scheduler: Session creation

---

## Session Fields Relevant to Assignment

From `/home/runner/workspace/src/types/database.ts` (lines 517-586):

```typescript
schedule_sessions: {
  Row: {
    provider_id: string; // Owner of the schedule
    assigned_to_sea_id: string | null; // SEA assigned to deliver
    assigned_to_specialist_id: string | null; // Specialist assigned to deliver
    delivered_by: 'provider' | 'sea' | 'specialist'; // Role expected to deliver
    // ... other fields
  }
}
```

**Field Usage**:

- `provider_id`: Creates the session in their schedule
- `assigned_to_specialist_id`: Specialist user ID assigned to deliver
- `assigned_to_sea_id`: SEA user ID assigned to deliver
- `delivered_by`: The role type expected to deliver

---

## Complete Data Flow Diagram

```
CalendarPage (page.tsx)
├── fetchData()
│   ├── Query sessions (provider_id only)
│   ├── Query students (with school filter)
│   ├── Query calendar events
│   └── Query holidays
├── Build students map
└── Pass to CalendarDayView
    │
    ├── (component receives sessions array)
    ├── But then IGNORES it!
    │
    └── useEffect: loadSessions()
        ├── Get authenticated user
        ├── Get user profile (role)
        └── Call sessionGenerator.getSessionsForDateRange()
            ├── Query instances (provider_id)
            ├── Query templates (provider_id)
            ├── Generate instances for date
            └── Return sessions array (ONLY for this provider)

    Display Logic:
    ├── Filter by student in map (school context)
    ├── Sort by start_time
    └── For each session:
        ├── Show grouping info if grouped
        ├── Show assignment badge (logic present but unreachable)
        └── Show delivered_by badge
```

---

## Potential Issues & Edge Cases

### 1. Assigned Sessions Not Displayed

- SessionGenerator only queries provider_id
- No logic to include assigned_to_specialist_id or assigned_to_sea_id
- Assignment badge code exists but unreachable

### 2. Session Generator Role Awareness

- SessionGenerator has no role parameter
- Cannot adjust query strategy based on user role
- Compare to use-schedule-data.ts which has role-aware queries

### 3. Real-Time Updates

- Calendar Page subscribes to assigned sessions
- But refetch uses incomplete query
- Assigned sessions appear in subscriptions but not in persistent state

### 4. Date Range Generation

- SessionGenerator always generates instances for provider only
- If provider is assigned a session for a date, won't be generated
- Student context filtering works at display level only

### 5. School Context

- Day View doesn't independently validate school context
- Relies on parent's students map for filtering
- If parent has incomplete data, Day View shows partial results

---

## Key Code References

| Component           | File                  | Lines   | Purpose                        |
| ------------------- | --------------------- | ------- | ------------------------------ |
| Calendar Page       | page.tsx              | 120-283 | Main data fetching             |
| Session Query       | page.tsx              | 148-177 | Load provider's sessions       |
| Calendar Day View   | calendar-day-view.tsx | 1-753   | Display sessions               |
| Session Loading     | calendar-day-view.tsx | 94-124  | Independent load               |
| Display Filtering   | calendar-day-view.tsx | 155-158 | Filter by student              |
| Grouping Permission | calendar-day-view.tsx | 84-91   | Check delivered_by match       |
| Assignment Badge    | calendar-day-view.tsx | 612-639 | Display assignment status      |
| SessionGenerator    | session-generator.ts  | 1-148   | Generate session instances     |
| Role Mapping        | role-utils.ts         | 1-32    | Normalize role to delivered_by |
| Schedule Data Hook  | use-schedule-data.ts  | 146-159 | Role-aware session query       |

---

## Summary

The Calendar Day view is designed primarily to show a provider's own sessions and templates for a specific date. It includes display logic for showing assigned sessions, but the data layer (SessionGenerator) does not fetch them. This creates a gap where:

1. Assignment badges are rendered but unreachable
2. Specialists/SEAs assigned to sessions don't see them in Calendar Day view
3. Real-time subscriptions exist but refresh uses incomplete queries
4. Unlike the Schedule page (which uses use-schedule-data.ts), Calendar doesn't have role-aware fetching

The fix would require either:

- Updating SessionGenerator to accept role and fetch assigned sessions, OR
- Having Calendar Day View use use-schedule-data.ts hook, OR
- Fetching assigned sessions separately and merging with provider sessions
