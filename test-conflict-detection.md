# Conflict Detection Test Plan

## Test Scenarios

### 1. Visual Conflict Indicators (Red Preview)

- **Action**: Drag a session over a time slot that has conflicts
- **Expected**: Red visual indicator (bg-red-200 with border-red-500) appears during drag
- **Timing**: Should appear within 50ms of hovering over conflict slot

### 2. Warning Dialog Before Database Update

- **Action**: Drop a session on a conflicting time slot
- **Expected**:
  - Warning dialog appears BEFORE any database changes
  - Dialog lists specific conflicts
  - Cancel option prevents any database update
  - Confirm option allows the move

### 3. No False Updates

- **Action**: Drop session on conflict and click Cancel
- **Expected**:
  - Session remains in original position
  - No database update occurs
  - No need to "revert" because update never happened

### 4. Valid Drops Work Normally

- **Action**: Drop session on valid (non-conflicting) slot
- **Expected**:
  - Blue visual indicator during drag
  - Immediate update without warning dialog
  - Session moves successfully

## Code Changes Summary

1. **session-update-service.ts**:
   - Added `validateOnly()` method for preview validation
   - Modified `updateSessionTime()` to require `forceUpdate` flag for conflicts
   - Database update only happens after validation or confirmation

2. **use-schedule-operations.ts**:
   - `handleSessionDrop`: Validates first, then shows dialog, then updates
   - `validateDragOver`: Uses `validateOnly()` method, reduced debounce to 50ms
   - Removed incorrect revert logic

3. **schedule-grid.tsx**:
   - Enhanced visual indicators (bg-red-200/border-red-500 for conflicts)

## Verification Steps

1. Check browser console for validation logs
2. Monitor network tab to ensure no premature database updates
3. Test rapid dragging to verify 50ms debounce works
4. Verify conflict detection for:
   - Bell schedule conflicts
   - Special activity conflicts
   - Concurrent session limits
   - Consecutive session rules
   - Break requirements
