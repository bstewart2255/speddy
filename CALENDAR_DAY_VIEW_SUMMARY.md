# Calendar Day View - Quick Summary

## What It Does

The Calendar Day view displays sessions for a logged-in provider for a specific date. It allows providers to:

- See their scheduled sessions in a time-based layout
- Group related sessions together
- View and manage assignments
- See calendar events and holidays

## Key Files

| File                                                                   | Purpose                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `/home/runner/workspace/app/(dashboard)/dashboard/calendar/page.tsx`   | Main Calendar page, handles data fetching and view switching                  |
| `/home/runner/workspace/app/components/calendar/calendar-day-view.tsx` | Day view component, displays sessions for a single date                       |
| `/home/runner/workspace/lib/services/session-generator.ts`             | Service that generates session instances from templates                       |
| `/home/runner/workspace/lib/supabase/hooks/use-schedule-data.ts`       | Hook with role-aware session queries (used by Schedule page, NOT by Calendar) |
| `/home/runner/workspace/lib/auth/role-utils.ts`                        | Role normalization utility                                                    |

## Data Flow Summary

```
CalendarPage
  ├─ Fetches provider's sessions + students + calendar events + holidays
  │  (Queries: provider_id = current user)
  │
  └─ Passes to CalendarDayView
      │
      └─ CalendarDayView
          ├─ IGNORES parent's sessions
          │
          └─ Calls SessionGenerator.getSessionsForDateRange()
              ├─ Fetches instances (session_date is NOT NULL)
              │  Query: provider_id = current user
              │
              ├─ Fetches templates (session_date IS NULL)
              │  Query: provider_id = current user
              │
              └─ Generates temp instances for the date
                 Returns: Only this provider's sessions

          └─ Displays sessions filtered by student in school
```

## Critical Finding: Assigned Sessions Bug

### The Issue

The Calendar Day view does NOT display sessions assigned to the current user as a specialist or SEA, even though:

1. The database has `assigned_to_specialist_id` and `assigned_to_sea_id` fields
2. The assignment badge display code exists (lines 612-639)
3. The Schedule page correctly displays these sessions
4. Real-time subscriptions are set up for assigned sessions

### Why It Happens

- `SessionGenerator.getSessionsForDateRange()` only queries `provider_id = current_user`
- No logic to include `assigned_to_specialist_id = current_user` or `assigned_to_sea_id = current_user`
- Assignment badge code condition (`session.provider_id !== providerId`) can never be true
- Assigned sessions never reach the display layer

### Example

```
Alice (Specialist) is assigned to deliver Bob's session
├─ In Database:
│  └─ provider_id=Bob, assigned_to_specialist_id=Alice, delivered_by='specialist'
│
├─ In Schedule Page:
│  └─ Query includes: (provider_id=Alice OR assigned_to_specialist_id=Alice)
│  └─ Result: ✓ Alice sees the session with "Assigned" badge
│
└─ In Calendar Day View:
   └─ Query only: provider_id=Alice
   └─ Result: ✗ Alice does NOT see the session
```

## Comparison: Schedule Page vs Calendar Day View

### Schedule Page (`use-schedule-data.ts` lines 146-159)

```typescript
// Role-aware query - INCLUDES assigned sessions
if (['resource', 'speech', 'ot', 'counseling', 'specialist'].includes(profile.role)) {
  sessionsQuery = sessionsQuery.or(
    `provider_id.eq.${user.id},assigned_to_specialist_id.eq.${user.id}`
  );
}
// Result: Specialists see their own + assigned sessions ✓
```

### Calendar Day View (`session-generator.ts` lines 22-35)

```typescript
// Role-unaware query - ONLY provider's sessions
const { data: instances } = await this.supabase
  .from('schedule_sessions')
  .select('*')
  .eq('provider_id', providerId); // ← ONLY provider's own

// Result: Specialists only see their own sessions ✗
```

## Session Types

### Templates (Main Schedule)

- `session_date` is NULL
- Recurring pattern defined by `day_of_week`, `start_time`, `end_time`
- Used to generate instances
- Modified when grouping sessions

### Instances (Specific Dates)

- `session_date` has a value (e.g., "2025-10-18")
- Specific occurrence on a particular date
- Can be completed, have notes, etc.
- Generated from templates or created manually

## Key Fields for Assignment

```typescript
schedule_sessions {
  provider_id: string              // Owner of the schedule
  assigned_to_specialist_id?: string  // Specialist assigned to deliver
  assigned_to_sea_id?: string         // SEA assigned to deliver
  delivered_by: 'provider' | 'sea' | 'specialist'  // Expected role
}
```

## Role Normalization

```
User Role → Delivered_By Value
'sea' → 'sea'
'specialist', 'speech', 'ot', 'counseling' → 'specialist'
'provider', 'resource', 'admin' → 'provider'
```

Used to:

1. Determine session creation assignments
2. Check grouping permissions
3. Match assigned sessions to current user

## Real-Time Subscriptions

Calendar Page sets up subscriptions for:

1. `provider_id = current_user` ✓ (Works)
2. `assigned_to_specialist_id = current_user` ✓ (Setup correct, but refetch incomplete)
3. `assigned_to_sea_id = current_user` ✓ (Setup correct, but refetch incomplete)

When triggered, these subscriptions call `fetchData()`, which uses incomplete queries.

## Display Filtering

Two levels of filtering occur:

1. **Data Layer** (SessionGenerator)
   - Only fetches provider's own sessions
   - Assigned sessions excluded here

2. **Display Layer** (CalendarDayView)
   ```typescript
   const filteredSessions = sessionsState.filter(s => students.has(s.student_id));
   ```

   - Only shows sessions for students in current school
   - Students map comes from parent component

## Grouping Logic

Only allows grouping if:

1. Session count >= 2
2. User's role matches `delivered_by` (via `canUserGroupSession()`)
3. User is the owner/assigned to deliver

Assignment badge display logic exists but is unreachable due to the data layer issue.

## Real-World Impact

### Current Behavior

- Providers see only their own sessions
- Specialists/SEAs assigned to sessions don't see them in Calendar
- Those users must use Schedule page instead
- Inconsistent experience between views

### Expected Behavior

- All users see sessions they're responsible for delivering
- Own sessions + assigned sessions both visible
- Consistent with Schedule page behavior
- Matches assignment badge intent

## Related Code

### Recent Attempts to Address

1. **Commit 2c2f79d** (Oct 18): Added "Assigned" badge display
   - Display code ready, but data layer incomplete

2. **Commit 8386bf5** (Oct 18): Restricted grouping by delivered_by
   - Permission logic correct, but data layer incomplete

3. **Commit 3700743** (Oct 18): Fixed duplicate sessions
   - Similar root cause: incomplete session data fetching

## Solution Path

To fix assigned sessions in Calendar Day View:

1. **Update SessionGenerator.getSessionsForDateRange()**
   - Add role parameter
   - Include `assigned_to_specialist_id` OR `assigned_to_sea_id` in queries
   - Follow pattern from `use-schedule-data.ts`

2. OR **Fetch assigned sessions separately**
   - Create parallel query for assigned sessions
   - Merge with provider sessions
   - Less code reuse but more isolated

3. OR **Use useScheduleData hook**
   - Already has correct logic
   - But requires refactoring Calendar to use it
   - Highest impact but most complete fix

## Files Modified by Recent Related Changes

- `app/components/calendar/calendar-day-view.tsx` (Added badge logic, commit 2c2f79d)
- `lib/auth/role-utils.ts` (Centralized mapping, commit 76ab52a)
- `app/components/schedule/schedule-sessions.tsx` (Fixed query, commit 3700743)

## Testing Considerations

To verify assigned sessions fix:

1. Create two accounts: ProviderA and SpecialistB
2. Create a session with ProviderA as owner
3. Assign SpecialistB to deliver it (set `delivered_by='specialist'`)
4. Login as SpecialistB
5. View Calendar Day view for that date
6. Expected: Session visible with "Assigned" badge
7. Current: Session not visible

## Performance Notes

- SessionGenerator creates temporary IDs for instances not yet saved
- Adds them to state immediately for display
- Minimal performance impact if assigned sessions added
- Would add ~O(n) queries (n = students) but same scale as current
