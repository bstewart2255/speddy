# Calendar Day View - Session Assignment Issue

## The Gap: Assigned Sessions Are Not Displayed

### Visual Representation

```
┌─────────────────────────────────────────────────────────────┐
│                    SUPABASE DATABASE                         │
├─────────────────────────────────────────────────────────────┤
│  schedule_sessions table                                     │
│  ─────────────────────────────────────────────────────────   │
│  Session A: provider_id=Alice, delivered_by='specialist'  ✓ │
│  Session B: provider_id=Bob, delivered_by='sea'           ✓ │
│  Session C: provider_id=Charlie,                          ✓ │
│             assigned_to_specialist_id=Alice ← Bob assigned │
│  Session D: provider_id=David,                               │
│             assigned_to_sea_id=Bob ← Bob assigned to sea   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  CALENDAR DAY VIEW (Alice)                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  sessionGenerator.getSessionsForDateRange(Alice)            │
│  └─ Query: provider_id = Alice ONLY                         │
│     └─ Returns: [Session A] ← Only Alice's own session      │
│                                                              │
│  Display: [Session A] ✓                                     │
│           [Session C] ✗ NOT SHOWN (assigned to Alice!)      │
│                                                              │
│  Result: Alice doesn't see Session C assigned to her        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│          SCHEDULE PAGE (Alice) - Works Correctly             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  useScheduleData hook (use-schedule-data.ts)                │
│  └─ Query: (provider_id = Alice OR                          │
│            assigned_to_specialist_id = Alice)               │
│     └─ Returns: [Session A, Session C]                      │
│                                                              │
│  Display: [Session A] ✓ (own session)                       │
│           [Session C] ✓ (assigned to me!)                   │
│           Shows "Assigned" badge on Session C               │
│                                                              │
│  Result: Alice sees all sessions she should deliver         │
└─────────────────────────────────────────────────────────────┘
```

---

## Query Comparison

### SessionGenerator.getSessionsForDateRange() - INCOMPLETE

**File**: `/home/runner/workspace/lib/services/session-generator.ts` (lines 22-35)

```typescript
// Instance sessions
const { data: instances } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId) // ← ONLY provider's own sessions
  .gte('session_date', startDate.toISOString().split('T')[0])
  .lte('session_date', endDate.toISOString().split('T')[0])
  .not('session_date', 'is', null);

// Template sessions
const { data: templates } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId) // ← ONLY provider's own templates
  .is('session_date', null);
```

**Missing**: No check for `assigned_to_specialist_id` or `assigned_to_sea_id`

---

### useScheduleData Hook - CORRECT

**File**: `/home/runner/workspace/lib/supabase/hooks/use-schedule-data.ts` (lines 146-159)

```typescript
let sessionsQuery = supabase
  .from('schedule_sessions')
  .select('*')
  .in('student_id', studentIds)
  .is('session_date', null);

// Build OR condition for provider_id or specialist assignment
if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(profile.role)) {
  sessionsQuery = sessionsQuery.or(
    `provider_id.eq.${user.id},assigned_to_specialist_id.eq.${user.id}`
    // ↑ Includes BOTH provider's own AND assigned sessions
  );
} else {
  sessionsQuery = sessionsQuery.eq('provider_id', user.id);
}

const sessionsResult = await sessionsQuery;
```

**Advantage**: Role-aware query that includes assigned sessions

---

## Code That's Ready But Unreachable

### Assignment Badge Display Logic

**File**: `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx` (lines 612-639)

```typescript
{(() => {
  // Check if this is a cross-provider assignment:
  // 1. Session belongs to another provider
  // 2. Current user's role matches the delivered_by (they're assigned to deliver it)
  const isAssignedToMe =
    session.provider_id !== providerId && canUserGroupSession(session);

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
      {session.delivered_by === 'sea' ? 'SEA' :
       session.delivered_by === 'specialist' ? 'Specialist' : 'Provider'}
    </span>
  );
})()}
```

**Problem**: The condition `session.provider_id !== providerId` will NEVER be true because:

1. SessionGenerator only returns sessions where `provider_id = providerId`
2. Assigned sessions are never in the `sessionsState` array

---

## Real-Time Subscription Setup

**File**: `/home/runner/workspace/app/(dashboard)/dashboard/calendar/page.tsx` (lines 322-368)

```typescript
// Subscribe to sessions where user is the provider
channel.on(
  'postgres_changes',
  {
    event: '*',
    schema: 'public',
    table: 'schedule_sessions',
    filter: `provider_id=eq.${data.currentUserId}`, // ✓ Correct
  },
  payload => {
    console.log('[useScheduleData] Real-time update (provider):', payload);
    fetchData(); // Refetch when provider's sessions change
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
      filter: `assigned_to_specialist_id=eq.${data.currentUserId}`, // ✓ Correct
    },
    payload => {
      console.log('[useScheduleData] Real-time update (specialist assignee):', payload);
      fetchData(); // Refetch when specialist's assignments change
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
      filter: `assigned_to_sea_id=eq.${data.currentUserId}`, // ✓ Correct
    },
    payload => {
      console.log('[useScheduleData] Real-time update (SEA assignee):', payload);
      fetchData(); // Refetch when SEA's assignments change
    }
  );
}
```

**Issue**: Real-time subscriptions are correct, but `fetchData()` calls an incomplete query:

- Subscribes to assigned sessions changes ✓
- But refetch only queries provider_id ✗

---

## Data Flow with the Bug

```
User: Alice (Specialist) logs in
├─ Role: 'specialist' → normalizeDeliveredBy() → 'specialist'
│
└─ Visit Calendar Page → Day View
   │
   ├─ SessionGenerator.getSessionsForDateRange(Alice_ID)
   │  ├─ Query: provider_id = Alice_ID
   │  │  └─ Returns: Alice's own sessions only
   │  │     [Session A: Alice's session]
   │  │
   │  └─ No query for: assigned_to_specialist_id = Alice_ID ✗
   │     └─ Missing: [Session C: Bob assigned Alice]
   │
   ├─ setSessionsState([Session A])
   │
   ├─ Display Filter: students.has(student_id)
   │  └─ Filters: [Session A] (if student in school map)
   │
   └─ Real-time subscription (Background)
      ├─ IF Session C is updated (assigned_to_specialist_id changed)
      │  └─ Triggers: fetchData() → but still incomplete query ✗
      │
      └─ Result: Session C never appears in Day View

Assignment Badge Code Exists but is Unreachable:
├─ isAssignedToMe = (session.provider_id !== Alice) && canUserGroupSession(session)
│  └─ provider_id is always Alice (only her sessions in state)
│     └─ isAssignedToMe is always FALSE ✗
│
└─ Badge never renders
```

---

## Why It Works in Schedule Page

```
User: Alice (Specialist) visits Schedule Page
│
└─ useScheduleData hook
   ├─ Fetches students (Alice's students)
   │
   ├─ Role check: 'specialist' is in ['resource', 'speech', 'ot', 'counseling', 'specialist']
   │  └─ TRUE
   │
   ├─ Builds query with OR:
   │  ├─ provider_id.eq.Alice_ID (Alice's own sessions)
   │  └─ assigned_to_specialist_id.eq.Alice_ID (Sessions assigned to Alice) ✓
   │
   ├─ Returns: [Session A (own), Session C (assigned)]
   │
   ├─ Real-time subscriptions (same as Calendar)
   │  ├─ Subscribes to provider_id=Alice_ID
   │  └─ Subscribes to assigned_to_specialist_id=Alice_ID ✓
   │
   └─ Result: Assignment badge displays correctly!
      └─ Orange badge "Assigned" appears on Session C
```

---

## Solution Options

### Option 1: Update SessionGenerator to Include Assigned Sessions

**Pros**:

- Consistent with existing service pattern
- Single place to manage session fetching logic

**Cons**:

- SessionGenerator needs role parameter
- Changes public API
- Duplicates logic from use-schedule-data.ts

### Option 2: Use useScheduleData Hook in Calendar

**Pros**:

- Leverages existing working code
- Role-aware queries already implemented
- Real-time subscriptions already setup correctly

**Cons**:

- Requires refactoring Calendar Page
- use-schedule-data is designed for schedule management
- May pull in unneeded dependencies

### Option 3: Fetch Assigned Sessions Separately

**Pros**:

- Minimal changes to SessionGenerator
- Clear separation of concerns

**Cons**:

- Two queries (provider + assigned)
- More complex merge logic
- Potential performance impact

---

## Related Recent Commits

1. **2c2f79d** (Oct 18): `feat: add 'Assigned' badge for cross-provider session assignments`
   - Added the assignment badge display code
   - But didn't fix the underlying data fetching

2. **8386bf5** (Oct 18): `feat: restrict session grouping based on delivered_by role`
   - Uses `normalizeDeliveredBy()` correctly for permission checks
   - But still doesn't fetch assigned sessions

3. **3700743** (Oct 18): `fix: prevent duplicate session creation`
   - Fixed issue with incomplete session data in counting
   - Similar root cause: not fetching complete data

---

## Summary

The Calendar Day view has a **data layer mismatch**:

- Display layer: Ready to show assigned sessions (badge code exists)
- Query layer: Only fetches provider's own sessions
- Result: Assigned sessions never reach the display layer

The fix requires ensuring that `getSessionsForDateRange()` (or an equivalent query) returns:

1. Provider's own sessions (where `provider_id = user_id`)
2. Sessions assigned to provider as specialist/SEA (where `assigned_to_specialist_id = user_id` or `assigned_to_sea_id = user_id`)
3. For the specific date range requested

This would make Calendar Day view consistent with Schedule Page's behavior.
