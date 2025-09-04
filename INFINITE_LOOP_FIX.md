# Infinite Loop Fix - Calendar Week View

## Critical Issue Found

The page was making endless requests to `/auth/v1/user` on page load, causing:

- Thousands of network requests before any user interaction
- Browser performance issues
- Potential API rate limiting

## Root Cause

`weekDates` was being recreated on EVERY render:

```javascript
// OLD - Creates new array on every render
const weekDates = getWeekDates();
```

Since `weekDates` was in the useEffect dependency array, this caused:

1. Component renders → new `weekDates` array created
2. useEffect sees "new" weekDates → triggers effect
3. Effect updates state → component re-renders
4. Back to step 1 (infinite loop!)

## Solution

1. **Memoized weekDates** using `useMemo`:

   ```javascript
   const weekDates = useMemo(() => {
     // ... calculate dates
   }, [weekOffset]);
   ```

   Now only recalculated when weekOffset changes.

2. **Removed unstable dependencies**:
   - Removed `supabase` from dependency arrays (it's a stable client)
   - Only track `currentSchool?.school_id` not the whole object

## Changes Made

- `weekDates` is now memoized with `useMemo`
- Removed `supabase` from three useEffect dependency arrays
- Already had: debouncing, loading guards, and proper cleanup

## Testing

After deploying:

1. Refresh the page
2. Check Network tab - should see minimal requests on load
3. Generate lessons - should work smoothly
4. No more infinite loops!

## Key Learning

Always memoize computed values that are used in useEffect dependencies, especially arrays and objects that would otherwise be recreated on every render.
