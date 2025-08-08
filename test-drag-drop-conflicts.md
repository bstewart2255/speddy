# Drag and Drop Conflict Indicators Test Plan

## Implementation Summary

The drag-and-drop system has been refactored to pre-calculate and display conflict indicators when dragging starts, rather than calculating them in real-time during the drag operation.

## Key Changes Made

### 1. **Pre-calculation on Drag Start** (`handleDragStart` in page.tsx)

- When a session drag starts, the system now:
  - Identifies the student being dragged
  - Iterates through ALL possible time slots (15-minute intervals) across ALL days
  - Validates each slot for THIS SPECIFIC STUDENT using the existing validation service
  - Stores all conflicted slots in a Set
  - Updates the UI state with pre-calculated conflicts
  - Processes validation in batches to avoid UI blocking

### 2. **Simplified Drag Over** (`handleDragOver` in page.tsx)

- Removed the debounced validation during drag
- Now only updates the drag position
- Conflicts are already known from pre-calculation

### 3. **Clear on Drag End** (`handleDragEnd` in page.tsx)

- Clears all conflict indicators when drag ends
- Ensures clean state for next drag operation

### 4. **Visual Conflict Indicators** (schedule-grid.tsx)

- Added a new section that renders red indicators for ALL conflicted slots
- Shows conflicts across ALL days simultaneously
- Red indicators (bg-red-200, border-red-500) appear for conflicted slots
- Current drag position shows stronger red (bg-red-300, border-red-600) if conflicted
- Blue indicators (bg-blue-200, border-blue-500) for valid drop zones
- Conflict indicators have lower z-index (5) than the drag preview (20)

## What Gets Validated

For each potential slot, the system checks (specific to the student being dragged):

1. **School hours** - Based on the student's grade level
2. **Bell schedules** - For the student's grade and school
3. **Special activities** - For the student's teacher
4. **Provider work schedule** constraints at the student's school
5. **Session capacity limits** (max 6 concurrent sessions)
6. **Student's existing sessions** - No overlaps with their other sessions
7. **Consecutive session rules** (max 60 min) for this student
8. **Break requirements** (30 min between non-consecutive) for this student
9. **Time bounds** - Sessions that would extend beyond grid bounds

## Performance Optimizations

1. **Batch Processing**: Validates slots in batches of 10 to avoid overwhelming the system
2. **Progressive Updates**: Updates the UI with conflicts as they're discovered
3. **Async Processing**: Validation runs asynchronously to avoid blocking the UI
4. **Skip Invalid Slots**: Skips slots that would go beyond grid bounds
5. **Skip Current Position**: Doesn't mark the session's current position as conflicted

## Expected Behavior

1. **Immediate Visual Feedback**:
   - Red indicators appear immediately when drag starts
   - No delay or hover time required

2. **Student-Specific Conflicts**:
   - Different students show different conflict patterns
   - Conflicts are based on individual student constraints

3. **Smooth Performance**:
   - Drag remains smooth at 60fps
   - Progressive conflict updates don't block UI

4. **Clear Visual Distinction**:
   - Red slots = Cannot place session here
   - Blue slot = Valid drop zone
   - Gray sessions = Other students (unaffected)

5. **Preserved Functionality**:
   - Warning dialogs still work on actual drop
   - Manual override after confirmation still available
   - Real-time updates from Supabase maintained

## Testing Checklist

- [ ] Start dragging a session - red indicators should appear immediately
- [ ] Red indicators should show only where THIS student cannot go
- [ ] Different students should show different red patterns when dragged
- [ ] Original session position should NOT be red
- [ ] Drag performance should remain smooth
- [ ] Dropping on a red slot should show warning dialog
- [ ] User can still override conflicts after confirmation
- [ ] Indicators clear when drag ends or is cancelled (ESC key)
- [ ] Works across all 5 days of the week
- [ ] Respects all validation rules (bell schedules, activities, etc.)

## Known Limitations

1. Initial validation may take 1-2 seconds for full week coverage
2. Very long sessions (60+ minutes) may have more slots to validate
3. Batch processing means conflicts appear progressively, not all at once

## Files Modified

1. `/app/(dashboard)/dashboard/schedule/page.tsx` - Main drag/drop logic
2. `/app/(dashboard)/dashboard/schedule/components/schedule-grid.tsx` - Visual indicators
3. Added import for `sessionUpdateService` to access validation

## Next Steps for Testing

1. Test with students of different grades
2. Test with sessions of different durations
3. Test with teachers who have special activities
4. Test drag and drop across different days
5. Verify performance with large schedules
6. Test conflict override functionality
