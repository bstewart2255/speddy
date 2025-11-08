# Calendar Day View Documentation Index

This documentation package provides a comprehensive analysis of how the Calendar Day view works and identifies a critical bug with assigned sessions not being displayed.

## Files in This Package

### 1. **CALENDAR_DAY_VIEW_SUMMARY.md** (START HERE)

**Best for**: Quick overview and executive summary

- What the Calendar Day view does
- Key files involved
- The critical assigned sessions bug
- Comparison with Schedule Page (which works correctly)
- Real-world impact and expected behavior
- Solution options
- Testing considerations

**Read this first if**: You want a quick understanding of the issue

---

### 2. **CALENDAR_DAY_VIEW_ANALYSIS.md** (DETAILED DEEP DIVE)

**Best for**: Complete technical understanding

- Full data flow analysis
- Component structure
- Session Generator internals
- Query logic at each layer
- Assignment fields and role mapping
- Real-time subscription setup
- Filtering logic (display and data layers)
- Edge cases and potential issues
- Complete data flow diagram
- Key code references table

**Read this when**: You need comprehensive technical details

---

### 3. **SESSION_ASSIGNMENT_ISSUE.md** (PROBLEM FOCUS)

**Best for**: Understanding the bug in detail

- Visual representation of the gap
- Query comparison (broken vs working)
- Code that's ready but unreachable
- Real-time subscription details
- Data flow with the bug illustrated
- Why it works in Schedule Page but not Calendar
- Solution options with pros/cons
- Related recent commits
- Testing procedure

**Read this when**: You want to understand and fix the bug

---

### 4. **CODE_SNIPPETS_REFERENCE.md** (IMPLEMENTATION GUIDE)

**Best for**: Developers implementing fixes

- All relevant code snippets with line numbers
- File locations for each snippet
- Issues and notes on each snippet
- Two concrete solution examples (Option A and Option B)
- Quick fix checklist
- Key takeaways for implementation

**Read this when**: You're ready to implement the fix

---

## Quick Navigation by Use Case

### "I need to understand how it works"

1. Start: CALENDAR_DAY_VIEW_SUMMARY.md
2. Details: CALENDAR_DAY_VIEW_ANALYSIS.md
3. Reference: CODE_SNIPPETS_REFERENCE.md

### "There's a bug with assigned sessions"

1. Start: SESSION_ASSIGNMENT_ISSUE.md
2. Details: CALENDAR_DAY_VIEW_ANALYSIS.md (sections 5-8)
3. Implementation: CODE_SNIPPETS_REFERENCE.md

### "I need to implement a fix"

1. Start: SESSION_ASSIGNMENT_ISSUE.md (Solution Options section)
2. Detailed code: CODE_SNIPPETS_REFERENCE.md
3. Full context: CALENDAR_DAY_VIEW_ANALYSIS.md

### "I'm debugging a specific issue"

1. Reference the file path in CODE_SNIPPETS_REFERENCE.md
2. Cross-reference with CALENDAR_DAY_VIEW_ANALYSIS.md data flow
3. Check SESSION_ASSIGNMENT_ISSUE.md for related issues

---

## The Core Issue in 30 Seconds

**Problem**: The Calendar Day view doesn't show sessions assigned to a specialist/SEA user, even though:

- The database has the assignment data
- The display code for badges exists
- Real-time subscriptions are configured
- The Schedule page displays them correctly

**Root Cause**: `SessionGenerator.getSessionsForDateRange()` only queries `provider_id = current_user`, not `assigned_to_specialist_id` or `assigned_to_sea_id`

**Result**: Assigned sessions never reach the component's state, so display logic can't render them

**Fix**: Make SessionGenerator role-aware and include assigned sessions in queries

---

## Key Files in the Codebase

| Component          | File                                             | Lines   | Purpose                           |
| ------------------ | ------------------------------------------------ | ------- | --------------------------------- |
| Main Calendar      | `/app/(dashboard)/dashboard/calendar/page.tsx`   | 1-679   | Data fetching, view switching     |
| Day View           | `/app/components/calendar/calendar-day-view.tsx` | 1-753   | Display sessions, grouping        |
| Session Generator  | `/lib/services/session-generator.ts`             | 1-148   | Generate instances from templates |
| Role Utils         | `/lib/auth/role-utils.ts`                        | 1-32    | Normalize roles to delivered_by   |
| Schedule Data Hook | `/lib/supabase/hooks/use-schedule-data.ts`       | 146-159 | (Reference: role-aware queries)   |
| Database Types     | `/src/types/database.ts`                         | 517-586 | Session schema definition         |

---

## Session Data Model

```typescript
// Key fields
provider_id: string                    // Owner of schedule
assigned_to_specialist_id?: string     // Specialist assigned to deliver
assigned_to_sea_id?: string           // SEA assigned to deliver
delivered_by: 'provider' | 'sea' | 'specialist'  // Expected role
session_date?: string                  // NULL=template, has value=instance
day_of_week: number                    // Mon=1, Sun=7
group_id?: string                      // For grouping sessions
group_name?: string                    // Group display name
```

---

## Data Flow (Current/Broken)

```
CalendarPage
  └─ fetchData()
     └─ Query: provider_id = user ✓
     └─ Pass sessions to CalendarDayView

CalendarDayView (receives sessions but ignores them!)
  └─ SessionGenerator.getSessionsForDateRange(user_id)
     ├─ Query instances: provider_id = user_id (NO assigned sessions)
     ├─ Query templates: provider_id = user_id (NO assigned sessions)
     └─ setSessionsState([only user's own sessions])

Display
  └─ Filter by student in school map
  └─ For each session:
     └─ Show grouping info if grouped
     └─ Try to show "Assigned" badge (but condition never true!)
     └─ Show delivered_by badge
```

---

## What Needs to Happen

```
SessionGenerator.getSessionsForDateRange(user_id, role)
  ├─ Query instances: provider_id = user_id OR
  │  ├─ assigned_to_specialist_id = user_id (if role is specialist variant)
  │  └─ assigned_to_sea_id = user_id (if role is sea)
  │
  ├─ Query templates: provider_id = user_id OR
  │  ├─ assigned_to_specialist_id = user_id (if role is specialist variant)
  │  └─ assigned_to_sea_id = user_id (if role is sea)
  │
  └─ Return: user's own + assigned sessions

Display
  └─ For sessions where provider_id != user_id:
     └─ Show "Assigned" badge (condition now true!)
```

---

## Real-Time Behavior

**Current Setup** (Correct):

- Subscribe to `provider_id = user` changes
- Subscribe to `assigned_to_specialist_id = user` changes (if specialist)
- Subscribe to `assigned_to_sea_id = user` changes (if SEA)

**Current Refetch** (Broken):

- On any of above events, call `fetchData()`
- `fetchData()` uses incomplete SessionGenerator query
- Assigned sessions appear in real-time but not persisted after refresh

**After Fix**:

- Same subscriptions (no change needed)
- Refetch uses complete query with assigned sessions

---

## Role Mapping (Important)

```
User's profile.role → normalizeDeliveredBy() → Query field
─────────────────────────────────────────────────────────
'sea'                → 'sea'                 → assigned_to_sea_id
'specialist'         → 'specialist'          → assigned_to_specialist_id
'speech'             → 'specialist'          → assigned_to_specialist_id
'ot'                 → 'specialist'          → assigned_to_specialist_id
'counseling'         → 'specialist'          → assigned_to_specialist_id
'provider'           → 'provider'            → (own sessions only)
'resource'           → 'provider'            → (own sessions only)
'admin'              → 'provider'            → (own sessions only)
```

---

## Testing Checklist

Before and after implementing fix:

```
Before Fix:
  [ ] Login as Specialist account
  [ ] Create session with Provider A
  [ ] Assign to Specialist (set delivered_by='specialist')
  [ ] View Calendar Day view for that date
  [ ] Verify session is NOT shown (current behavior)

After Fix:
  [ ] Verify session IS shown
  [ ] Verify "Assigned" badge appears (orange badge)
  [ ] Verify badge styling is correct
  [ ] Assign session while viewing (real-time update)
  [ ] Verify session appears immediately
  [ ] Logout and login again
  [ ] Verify session still shows on reload
  [ ] Test with SEA role (if applicable)
```

---

## Performance Considerations

**Current Performance**:

- 2 queries: instances + templates (both filtered by provider_id)
- Minimal data returned

**After Fix**:

- 2 queries: instances + templates (both with OR condition)
- Slightly more data returned (instances for other providers assigned to user)
- Merge logic: O(n) where n = returned sessions
- Overall impact: Negligible for typical provider (20-50 sessions)

**Optimization Options**:

- Batch the two queries into one with subqueries
- Add database index on `assigned_to_specialist_id` and `assigned_to_sea_id`
- Use role parameter in SessionGenerator to build different queries

---

## Related Commits

| Commit  | Date   | Change                       | Impact                                       |
| ------- | ------ | ---------------------------- | -------------------------------------------- |
| 2c2f79d | Oct 18 | Add "Assigned" badge display | Display code ready but unreachable           |
| 8386bf5 | Oct 18 | Restrict grouping by role    | Permission logic correct                     |
| 3700743 | Oct 18 | Fix duplicate sessions       | Similar incomplete data issue                |
| 76ab52a | Oct 18 | Centralize role mapping      | normalizeDeliveredBy() now used consistently |

---

## Quick Reference: File Locations

```
App Structure:
  app/
    (dashboard)/
      dashboard/
        calendar/
          page.tsx ← Calendar Page (main entry)
    components/
      calendar/
        calendar-day-view.tsx ← Day View Component

Services:
  lib/
    services/
      session-generator.ts ← Session fetching
    supabase/
      hooks/
        use-schedule-data.ts ← Reference: role-aware queries
    auth/
      role-utils.ts ← Role normalization

Types:
  src/
    types/
      database.ts ← Schema definition
```

---

## For Different Audiences

**Product Manager**: Read CALENDAR_DAY_VIEW_SUMMARY.md (Real-World Impact section)

**Designer**: Reference CODE_SNIPPETS_REFERENCE.md (Assignment badge display code)

**Junior Developer**: Start with CALENDAR_DAY_VIEW_SUMMARY.md, then CALENDAR_DAY_VIEW_ANALYSIS.md

**Senior Developer**: Skim CALENDAR_DAY_VIEW_SUMMARY.md, jump to SESSION_ASSIGNMENT_ISSUE.md Solution Options

**DevOps/QA**: Check SESSION_ASSIGNMENT_ISSUE.md Testing Procedure section and this index's Testing Checklist

---

## Document Versions

- Created: October 18, 2025
- Scope: Calendar Day View data flow and assigned sessions bug
- Codebase: Speddy (Educational scheduling application)
- Database: Supabase PostgreSQL
- Framework: Next.js with React

---

## Getting Help

If you need to understand a specific aspect:

1. **Data Flow**: See CALENDAR_DAY_VIEW_ANALYSIS.md
2. **The Bug**: See SESSION_ASSIGNMENT_ISSUE.md
3. **Code Locations**: See CODE_SNIPPETS_REFERENCE.md
4. **Quick Overview**: See CALENDAR_DAY_VIEW_SUMMARY.md
5. **Implementation**: See CODE_SNIPPETS_REFERENCE.md Solution Examples

All documents cross-reference each other with file paths and line numbers.
