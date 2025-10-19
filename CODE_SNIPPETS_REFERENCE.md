# Calendar Day View - Code Snippets Reference

## 1. SessionGenerator - Query for Instances

**File**: `/home/runner/workspace/lib/services/session-generator.ts` (Lines 22-28)

```typescript
// First, get all instance sessions (where session_date is NOT NULL)
const { data: instances } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId) // ← ONLY provider's own
  .gte('session_date', startDate.toISOString().split('T')[0])
  .lte('session_date', endDate.toISOString().split('T')[0])
  .not('session_date', 'is', null);
```

**Issue**: No check for assigned sessions

---

## 2. SessionGenerator - Query for Templates

**File**: `/home/runner/workspace/lib/services/session-generator.ts` (Lines 31-35)

```typescript
// Get template sessions (where session_date is NULL)
const { data: templates } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId) // ← ONLY provider's own
  .is('session_date', null);
```

**Issue**: No check for assigned sessions

---

## 3. Use-Schedule-Data - Correct Role-Aware Query

**File**: `/home/runner/workspace/lib/supabase/hooks/use-schedule-data.ts` (Lines 146-159)

```typescript
// For specialist users, also fetch sessions assigned to them
let sessionsQuery = supabase
  .from('schedule_sessions')
  .select('*')
  .in('student_id', studentIds)
  .is('session_date', null);

// Build OR condition for provider_id or specialist assignment
if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(profile.role)) {
  sessionsQuery = sessionsQuery.or(
    `provider_id.eq.${user.id},assigned_to_specialist_id.eq.${user.id}`
  );
} else {
  sessionsQuery = sessionsQuery.eq('provider_id', user.id);
}

const sessionsResult = await sessionsQuery;
```

**Why it works**: Includes sessions where user is provider OR assigned_to_specialist_id

---

## 4. Calendar Day View - Session Loading

**File**: `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx` (Lines 94-124)

```typescript
// Load sessions and user info for the current date
React.useEffect(() => {
  const loadSessions = async () => {
    if (!currentDate) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    setCurrentUser(user);
    setProviderId(user.id);

    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_site, school_district')
      .eq('id', user.id)
      .single();

    setUserProfile(profile);

    // Get sessions for just this day
    const sessions = await sessionGenerator.getSessionsForDateRange(
      user.id,
      currentDate,
      currentDate
    );

    setSessionsState(sessions);
  };

  loadSessions();
}, [currentDate, sessionGenerator, supabase]);
```

**Issue**: Calls SessionGenerator which only returns provider's sessions

---

## 5. Calendar Day View - Display Filtering

**File**: `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx` (Lines 155-158)

```typescript
// Memoize filtered sessions for performance
const filteredSessions = useMemo(
  () => sessionsState.filter(s => students.has(s.student_id)),
  [sessionsState, students]
);
```

**Note**: Only filters by student in map; doesn't help with missing assigned sessions

---

## 6. Calendar Day View - Grouping Permission Check

**File**: `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx` (Lines 84-91)

```typescript
// Helper function to check if current user can group a session
const canUserGroupSession = (session: ScheduleSession): boolean => {
  if (!userProfile?.role) return false;

  // Map user role to delivered_by value using centralized function
  const expectedDeliveredBy = normalizeDeliveredBy(userProfile.role);

  return session.delivered_by === expectedDeliveredBy;
};
```

**Purpose**: Ensures only the right role can group sessions

---

## 7. Calendar Day View - Assignment Badge Display

**File**: `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx` (Lines 612-639)

```typescript
{(() => {
  // Check if this is a cross-provider assignment:
  // 1. Session belongs to another provider
  // 2. Current user's role matches the delivered_by (they're assigned to deliver it)
  const isAssignedToMe = session.provider_id !== providerId && canUserGroupSession(session);

  if (isAssignedToMe) {
    // Current user assigned to deliver another provider's session
    return (
      <span className="text-xs px-2 py-1 rounded bg-orange-100 text-orange-700">
        Assigned
      </span>
    );
  }

  // Normal delivered_by badge
  return (
    <span className={`text-xs px-2 py-1 rounded ${
      session.delivered_by === 'sea'
        ? 'bg-green-100 text-green-700'
        : session.delivered_by === 'specialist'
          ? 'bg-purple-100 text-purple-700'
          : 'bg-blue-100 text-blue-700'
    }`}>
      {session.delivered_by === 'sea' ? 'SEA' : session.delivered_by === 'specialist' ? 'Specialist' : 'Provider'}
    </span>
  );
})()}
```

**Critical Issue**: Condition `session.provider_id !== providerId` will never be true because SessionGenerator only returns sessions where `provider_id = providerId`

---

## 8. Role Normalization Utility

**File**: `/home/runner/workspace/lib/auth/role-utils.ts`

```typescript
export type DeliveredByRole = 'provider' | 'sea' | 'specialist';

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

- Calendar Day View grouping permission check
- Session creation in schedulers
- Assignment badge matching

---

## 9. Real-Time Subscriptions for Assigned Sessions

**File**: `/home/runner/workspace/app/(dashboard)/dashboard/calendar/page.tsx` (Lines 322-368)

```typescript
// Subscribe to sessions where user is the provider
channel.on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
    table: 'schedule_sessions',
    filter: `provider_id=eq.${data.currentUserId}`,
  },
  payload => {
    console.log('[useScheduleData] Real-time update (provider):', payload);
    fetchData();
  }
);

// For specialist users, also subscribe to sessions assigned to them
if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(data.providerRole)) {
  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'schedule_sessions',
      filter: `assigned_to_specialist_id=eq.${data.currentUserId}`,
    },
    payload => {
      console.log('[useScheduleData] Real-time update (specialist assignee):', payload);
      fetchData(); // ← Calls incomplete query
    }
  );
}

// For SEA users, also subscribe to sessions assigned to them
if (data.providerRole === 'sea') {
  channel.on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'schedule_sessions',
      filter: `assigned_to_sea_id=eq.${data.currentUserId}`,
    },
    payload => {
      console.log('[useScheduleData] Real-time update (SEA assignee):', payload);
      fetchData(); // ← Calls incomplete query
    }
  );
}
```

**Issue**: Subscriptions correctly set up, but `fetchData()` uses incomplete SessionGenerator query

---

## 10. Calendar Page - Main Data Fetch

**File**: `/home/runner/workspace/app/(dashboard)/dashboard/calendar/page.tsx` (Lines 148-177)

```typescript
// Fetch sessions filtered by current school
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
  .eq('provider_id', user.id); // ← Parent also only fetches provider's own

// Apply school filter if currentSchool is available (normalize aliases)
if (currentSchool) {
  const schoolId = currentSchool.school_id ?? null;
  const schoolSite = currentSchool.school_site ?? (currentSchool as any).site;
  const schoolDistrict = currentSchool.school_district ?? (currentSchool as any).district;

  if (schoolSite && schoolDistrict) {
    // Filter by school_site and school_district which includes all sessions at this school
    sessionQuery = sessionQuery
      .eq('students.school_site', schoolSite)
      .eq('students.school_district', schoolDistrict);
  }
}

const { data: sessionData, error: sessionError } = await sessionQuery;
```

**Note**: Parent component also only queries provider's own sessions, but this isn't used by CalendarDayView anyway

---

## 11. Database Schema - Schedule Sessions

**File**: `/home/runner/workspace/src/types/database.ts` (Lines 517-540)

```typescript
schedule_sessions: {
  Row: {
    id: string;
    provider_id: string; // Owner of the schedule
    student_id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    service_type: string;
    assigned_to_sea_id: string | null; // ← SEA assigned to deliver
    assigned_to_specialist_id: string | null; // ← Specialist assigned to deliver
    delivered_by: 'provider' | 'sea' | 'specialist'; // ← Role expected to deliver
    created_at: string;
    completed_at: string | null;
    completed_by: string | null;
    session_date: string | null; // NULL = template, has value = instance
    session_notes: string | null;
    manually_placed: boolean;
    is_completed: boolean;
    student_absent: boolean;
    outside_schedule_conflict: boolean;
    group_id: string | null;
    group_name: string | null;
  }
  // Insert and Update types follow same pattern...
}
```

**Key Fields for Assignment**:

- `provider_id`: Who owns the session in their schedule
- `assigned_to_specialist_id`: Specialist user ID assigned to deliver
- `assigned_to_sea_id`: SEA user ID assigned to deliver
- `delivered_by`: Role type expected to deliver

---

## Solution Examples

### Option A: Update SessionGenerator

```typescript
async getSessionsForDateRange(
  providerId: string,
  startDate: Date,
  endDate: Date,
  userRole?: string  // ← Add role parameter
): Promise<ScheduleSession[]> {
  // ... existing code for instances and templates ...

  // NEW: Also fetch assigned sessions if user is specialist/SEA
  if (userRole && ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea'].includes(userRole)) {
    let assignedQuery = this.supabase
      .from('schedule_sessions')
      .select('*')
      .gte('session_date', startDate.toISOString().split('T')[0])
      .lte('session_date', endDate.toISOString().split('T')[0])
      .not('session_date', 'is', null);

    if (userRole === 'sea') {
      assignedQuery = assignedQuery.eq('assigned_to_sea_id', providerId);
    } else {
      assignedQuery = assignedQuery.eq('assigned_to_specialist_id', providerId);
    }

    const { data: assignedInstances } = await assignedQuery;
    if (assignedInstances) {
      sessions.push(...assignedInstances);
    }
  }

  return sessions;
}
```

### Option B: Fetch Separately in Calendar Day View

```typescript
const loadSessions = async () => {
  // ... existing code ...

  const sessions = await sessionGenerator.getSessionsForDateRange(
    user.id,
    currentDate,
    currentDate
  );

  // NEW: Fetch assigned sessions
  let assignedSessions: ScheduleSession[] = [];
  if (
    profile?.role &&
    ['resource', 'speech', 'ot', 'counseling', 'specialist', 'sea'].includes(profile.role)
  ) {
    const dateStr = currentDate.toISOString().split('T')[0];
    let query = supabase
      .from('schedule_sessions')
      .select('*')
      .eq('session_date', dateStr)
      .not('session_date', 'is', null);

    if (profile.role === 'sea') {
      query = query.eq('assigned_to_sea_id', user.id);
    } else {
      query = query.eq('assigned_to_specialist_id', user.id);
    }

    const { data: assigned } = await query;
    assignedSessions = assigned || [];
  }

  // Merge sessions
  const allSessions = [...sessions, ...assignedSessions];
  setSessionsState(allSessions);
};
```

---

## Key Takeaways

1. **SessionGenerator gap**: Only queries `provider_id`, excludes assigned sessions
2. **Display code ready**: Assignment badge logic exists but unreachable
3. **Use-schedule-data pattern**: Shows correct approach with role-aware OR queries
4. **Real-time subscriptions correct**: But refetch uses incomplete query
5. **Two-level filtering**: Data layer (SessionGenerator) AND display layer (CalendarDayView)
6. **Role mapping centralized**: `normalizeDeliveredBy()` used consistently

---

## Quick Fix Checklist

- [ ] Identify chosen solution (update SessionGenerator vs separate fetch vs refactor)
- [ ] Add role parameter to SessionGenerator (if Option A)
- [ ] Update query to include assigned_to_specialist_id OR assigned_to_sea_id
- [ ] Handle SEA vs Specialist role distinction
- [ ] Test with specialist account assigned to session
- [ ] Verify "Assigned" badge appears correctly
- [ ] Test real-time subscriptions (assign session while viewing)
- [ ] Verify no performance degradation
- [ ] Update unit tests if applicable
