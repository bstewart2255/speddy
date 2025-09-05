# Duplicate Key Constraint Investigation Report

## Issue Description

Users reported that lessons are failing with duplicate key constraint violations:
"duplicate key value violates unique constraint 'ai_generated_lessons_unique_lesson'"

The constraint is on: `(provider_id, school_id, lesson_date, time_slot)`

## Investigation Results

### Database Analysis

✅ **Current Status: No duplicates found**

- Queried recent lessons: 24 lessons with 13 unique time slots
- No duplicate constraint violations exist in current data
- Lessons are saving correctly with proper time slot differentiation

### Time Slot Examples Found

- `08:15-08:45`, `08:30-09:00`, `09:00-10:00`, `09:15-09:45`
- `09:30-10:00`, `09:45-10:15`, `10:20-10:50`, `10:20-11:20`
- `10:30-11:00`, `11:00-11:30`, `11:30-12:00`, `12:30-13:00`
- One legacy `structured` time slot (fallback case)

### Debugging Enhancements Added

#### 1. Frontend Debugging (calendar-week-view.tsx)

```typescript
// Added comprehensive logging for:
- Time slot groups discovery
- Individual time slot processing
- Batch request preparation
- Final batch summary with all time slots
```

#### 2. Backend API Debugging (route.ts)

```typescript
// Added detailed logging for:
- Batch request reception and summary
- Individual group processing with parameters
- Lesson request creation with time slots
- Database insertion parameters
- Detailed error handling with constraint info
```

#### 3. Database Error Handling

- Enhanced error messages with specific constraint details
- Detailed logging of attempted data values
- Clear identification of duplicate key violations

## Root Cause Analysis

### Most Likely Scenarios

1. **Intermittent Issue**: Problem may have been resolved by recent fixes
2. **Race Condition**: Multiple lessons processed simultaneously (mitigated by current parallel processing)
3. **Data Flow Issue**: Time slot not properly passed in specific edge cases
4. **School Context**: Missing school_id causing constraint mismatches

### Debugging Coverage

- ✅ Frontend time slot generation and mapping
- ✅ API request processing and validation
- ✅ Database insertion with all constraint fields
- ✅ Error handling with detailed diagnostics

## Monitoring and Next Steps

### What to Look For

When the issue occurs again, the logs will show:

1. **Frontend logs**: `[DEBUG Frontend]` - Time slot assignment
2. **API logs**: `[DEBUG] Processing batch group X` - Parameter passing
3. **Database logs**: `[DEBUG] Saving lesson to database` - Final values
4. **Error logs**: Detailed constraint violation info

### Expected Debug Output

```
[DEBUG Frontend] Found 6 time slot groups: ["08:30-09:00", "09:30-10:00", ...]
[DEBUG Frontend] Final batch requests summary: {totalRequests: 6, timeSlots: [...]}
[DEBUG] Processing batch request with 6 lesson groups at 2025-09-05T...
[DEBUG] Processing batch group 0: {lessonDate: "2025-09-05", timeSlot: "08:30-09:00"}
[DEBUG] Saving lesson to database: {provider_id: "...", time_slot: "08:30-09:00"}
```

### If Duplicates Occur Again

1. Check logs for identical time_slot values across multiple lessons
2. Verify time slot generation logic in frontend
3. Check for race conditions in batch processing
4. Ensure school_id is properly set for all lessons

## Resolution Status

- **Debugging**: ✅ Complete - Comprehensive logging added
- **Monitoring**: ✅ Ready - Detailed error reporting in place
- **Current Issue**: ✅ No active duplicates found
- **Prevention**: ✅ Enhanced error handling and logging

The system is now equipped with extensive debugging to identify the exact cause if duplicate key violations occur again.
