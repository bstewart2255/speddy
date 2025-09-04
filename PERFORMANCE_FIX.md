# Performance Fix for AI Lesson Generation

## Problem

After fixing the database constraints, lessons were saving successfully BUT:

1. The browser was making 10,000+ network requests
2. The UI was extremely slow to update (30-60 seconds)
3. The browser console showed lessons saving one at a time very slowly

## Root Cause

The `useEffect` that loads saved lessons had `currentSchool` in its dependency array. This created a loop:

1. Saving lessons might trigger a school context update
2. School context update triggers lesson reload
3. Multiple rapid reloads create thousands of requests

## Solution Applied

1. **Changed dependency**: From `currentSchool` to `currentSchool?.school_id` (only track the ID, not the whole object)
2. **Added debouncing**: 100ms delay before loading to prevent rapid reloads
3. **Added loading guard**: Using a ref to prevent concurrent loads
4. **Added cancellation**: Clean up function to cancel pending loads

## Code Changes

- Added `loadingLessonsRef` to track loading state without triggering re-renders
- Added cancellation flag to prevent stale requests
- Added setTimeout debouncing to batch rapid changes
- Changed the useEffect dependency to only track school_id

## Expected Behavior After Fix

- Lessons should save and the UI should update within 1-2 seconds
- Network requests should be minimal (just the saves and one reload)
- No more infinite loops or thousands of requests

## Testing

After deploying these changes:

1. Generate AI lessons
2. Check browser console - should show lessons saving quickly
3. Check network tab - should show reasonable request count
4. UI should update promptly after generation completes
