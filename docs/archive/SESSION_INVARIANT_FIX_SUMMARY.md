# Session Count Invariant Fix - Summary

## Problem

The system was creating duplicate session records, violating the critical invariant:

```
scheduled_sessions + unscheduled_sessions = sessions_per_week
```

### Root Causes

1. **Auto-scheduler bug**: When clicking "Schedule Sessions", the scheduler was INSERTing new session records instead of UPDATEing existing unscheduled sessions (those with `day_of_week=null`, `start_time=null`, `end_time=null`)

2. **Student update bug**: When updating a student's `sessions_per_week` from 3 to 5, the system wasn't creating the 2 additional unscheduled sessions

## Solution Implemented

### 1. Fixed Auto-Scheduler (`lib/scheduling/optimized-scheduler.ts`)

**Changes:**

- Before scheduling, fetch ALL unscheduled sessions for the students being scheduled
- Match scheduled sessions with existing unscheduled session IDs
- UPDATE existing unscheduled sessions (add day/time) instead of INSERTing new ones
- Only INSERT if there aren't enough unscheduled sessions (edge case protection)

**Code Location:** Lines 473-596

### 2. Fixed Student Update Logic (`lib/scheduling/session-requirement-sync.ts`)

**Changes:**

- Modified `adjustSessionCount()` to handle BOTH increases and decreases
- When `sessions_per_week` increases, create new unscheduled sessions
- When `sessions_per_week` decreases, delete excess sessions (unscheduled first)
- Added edge case handling for students with no sessions who get requirements added

**Code Locations:**

- Lines 57-104: Handle initial session creation
- Lines 75-87: Pass `providerId` to adjustment function
- Lines 168-249: Enhanced `adjustSessionCount()` function

### 3. Data Cleanup Migration (`supabase/migrations/20251031_cleanup_duplicate_sessions.sql`)

**Purpose:**

- Clean up existing duplicate sessions in production data
- Prioritizes deleting unscheduled sessions first
- Preserves already-scheduled sessions when possible
- Logs all cleanup actions for audit trail

## Expected Behavior After Fix

### When Adding a Student

1. User creates student with `sessions_per_week = 5`
2. System automatically creates 5 unscheduled sessions (with null day/time)
3. Sessions appear in "Unscheduled Sessions" dropdown ✅

### When Updating a Student (Increase)

1. User updates student from `sessions_per_week = 3` to `5`
2. System creates 2 additional unscheduled sessions
3. Total: 3 existing + 2 new = 5 sessions ✅

### When Updating a Student (Decrease)

1. User updates student from `sessions_per_week = 5` to `3`
2. System deletes 2 excess sessions (unscheduled first)
3. Total: 5 existing - 2 deleted = 3 sessions ✅

### When Auto-Scheduling

1. User has student with 5 unscheduled sessions
2. User clicks "Schedule Sessions"
3. System UPDATEs those 5 unscheduled sessions (adds day/time)
4. Sessions move from dropdown to grid
5. Total sessions remains 5 ✅

## Testing Recommendations

### Manual Tests

1. **Create new student** with `sessions_per_week = 3`
   - Verify 3 unscheduled sessions appear
   - Click "Schedule Sessions"
   - Verify still only 3 total sessions (now scheduled)

2. **Update existing student** from 3 to 5 sessions
   - Verify 2 new unscheduled sessions appear
   - Total should be 5

3. **Update existing student** from 5 to 2 sessions
   - Verify 3 sessions are deleted
   - Total should be 2

4. **Database check** after running migration:
   ```sql
   -- This query should return no rows
   SELECT
     s.initials,
     s.sessions_per_week,
     COUNT(ss.id) as actual_sessions
   FROM students s
   LEFT JOIN schedule_sessions ss ON ss.student_id = s.id AND ss.is_completed = false
   WHERE s.sessions_per_week IS NOT NULL
   GROUP BY s.id, s.initials, s.sessions_per_week
   HAVING COUNT(ss.id) != s.sessions_per_week;
   ```

### Automated Tests (Recommended for Future)

- Unit tests for `adjustSessionCount()` with increase/decrease scenarios
- Integration tests for auto-scheduler UPDATE behavior
- E2E tests for complete user workflows

## Migration Instructions

1. **Before deploying:**
   - Back up production database
   - Review the migration SQL to understand what it does

2. **Deploy code changes:**
   - Deploy the updated TypeScript files
   - These are backward compatible with existing data

3. **Run migration:**

   ```bash
   # This will clean up existing duplicate sessions
   npx supabase migration up
   ```

4. **Verify:**
   - Run the database check query above
   - Check application logs for any errors
   - Test creating/updating students in production

## Files Modified

1. `lib/scheduling/optimized-scheduler.ts`
2. `lib/scheduling/session-requirement-sync.ts`
3. `supabase/migrations/20251031_cleanup_duplicate_sessions.sql` (new)

## Rollback Plan

If issues occur:

1. Revert the code changes using git
2. The migration is safe and doesn't need to be rolled back (it only deletes duplicates)
3. If absolutely necessary, restore from pre-migration database backup
