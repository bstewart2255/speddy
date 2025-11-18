# TypeScript Strict Mode Migration Plan

## Overview

TypeScript strict mode has been enabled with temporary exceptions for `noImplicitAny` and `useUnknownInCatchVariables`. This allows the codebase to benefit from most strict checks while providing time to fix the remaining issues.

## Current Status

- ✅ Strict mode enabled
- ✅ Strict null checks enabled
- ⚠️ `noImplicitAny` temporarily disabled
- ⚠️ `useUnknownInCatchVariables` temporarily disabled

## Migration Steps

### Phase 1: Fix Error Handling (Priority: High)

All catch blocks need to properly type the error variable:

```typescript
// Before
} catch (error) {
  console.error(error);
}

// After
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Unknown error');
}
```

Files to fix:

- `app/(dashboard)/dashboard/students/page.tsx`
- `app/components/ai-content-modal.tsx`
- `app/components/schedule/*.tsx`
- `app/components/students/student-details-modal.tsx`
- `lib/scheduling/*.ts`
- `lib/supabase/hooks/use-auto-schedule.ts`
- `lib/supabase/safe-query.ts`

### Phase 2: Add Explicit Types (Priority: Medium)

Add types to all function parameters:

```typescript
// Before
function processStudent(student, index) { ... }

// After
function processStudent(student: Student, index: number) { ... }
```

Files to fix:

- `app/(dashboard)/dashboard/sea/page.tsx`
- `app/api/generate-lesson/route.ts`
- `app/components/team-widget.tsx`

### Phase 3: Fix Type Incompatibilities (Priority: Medium)

Resolve type mismatches in component props and state:

- `app/components/calendar/calendar-week-view.tsx`

### Phase 4: Enable Full Strict Mode (Priority: Low)

Once all issues are fixed:

1. Remove `"noImplicitAny": false`
2. Remove `"useUnknownInCatchVariables": false`
3. Run full type check: `npx tsc --noEmit`

## Recommended Approach

1. Fix one file at a time
2. Test functionality after each fix
3. Commit changes incrementally
4. Use type guards for better type safety

## Type Guard Examples

```typescript
// Error type guard
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

// API response type guard
function isValidResponse(data: unknown): data is ApiResponse {
  return typeof data === 'object' && data !== null && 'success' in data;
}
```

## Benefits of Completion

- Catch more bugs at compile time
- Better IDE support and autocomplete
- Improved code maintainability
- Reduced runtime errors
