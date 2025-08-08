# Phase 3: Separated Business Logic Migration Guide

## Overview

Phase 3 successfully separates the monolithic `OptimizedScheduler` class into focused, single-responsibility classes:

- **ConstraintValidator**: Handles all constraint validation logic
- **SessionDistributor**: Manages session distribution strategies
- **SchedulingEngine**: Contains core scheduling algorithms
- **SchedulingCoordinator**: Orchestrates the scheduling process

## Architecture Changes

### Before (Monolithic)

```
OptimizedScheduler
├── Data fetching
├── Constraint validation
├── Session distribution
├── Scheduling algorithms
└── Context management
```

### After (Modular)

```
SchedulingCoordinator
├── ConstraintValidator (validation only)
├── SessionDistributor (distribution only)
├── SchedulingEngine (algorithms only)
└── SchedulingDataManager (data only)
```

## New Components

### 1. ConstraintValidator (`/lib/scheduling/constraint-validator.ts`)

Validates scheduling constraints with specialized methods:

- `validateWorkLocationConstraints()`: Provider availability at location
- `validateConsecutiveSessionLimits()`: Max 60 minutes without break
- `validateBreakRequirements()`: 30-minute break between non-consecutive sessions
- `validateBellScheduleConflicts()`: No conflicts with bell schedules
- `validateSpecialActivityConflicts()`: No conflicts with special activities
- `validateSchoolHours()`: Sessions within school hours
- `validateConcurrentSessionLimits()`: Max 6 concurrent sessions
- `validateAllConstraints()`: Comprehensive validation

### 2. SessionDistributor (`/lib/scheduling/session-distributor.ts`)

Implements distribution strategies:

- `distributeEvenly()`: Spread sessions across days
- `distributeWithGradeGrouping()`: Group by grade level
- `distributeTwoPass()`: First pass (3 max), second pass (6 max)
- `sortSlotsWithGradePreference()`: Optimize grade grouping
- `getDistributionStrategy()`: Automatic strategy selection

### 3. SchedulingEngine (`/lib/scheduling/scheduling-engine.ts`)

Core scheduling algorithms:

- `findOptimalSlots()`: Find best slots for a student
- `distributeSessions()`: Apply distribution strategy
- `optimizeScheduleOrder()`: Order students by difficulty
- `optimizeSlotSelection()`: Score and optimize slot combinations

### 4. SchedulingCoordinator (`/lib/scheduling/scheduling-coordinator.ts`)

Orchestrates the scheduling process:

- `initialize()`: Set up coordinator with provider/school
- `scheduleStudent()`: Schedule single student
- `scheduleBatch()`: Schedule multiple students
- `validateSlot()`: Validate specific slot
- `findAvailableSlots()`: Find all valid slots
- `optimizeDistribution()`: Optimize slot distribution

## Configuration Updates

The `scheduling-config.ts` has been extended with new options:

```typescript
export const DEFAULT_SCHEDULING_CONFIG = {
  // Existing settings
  maxConcurrentSessions: 6, // Updated from 4
  maxSessionsPerDay: 2, // Updated from 1

  // New constraint settings
  maxConsecutiveMinutes: 60,
  minBreakMinutes: 30,
  schoolEndTime: '15:00',
  timeSlotInterval: 15,

  // New distribution strategies
  distributionStrategy: 'two-pass',
  priorityStrategy: 'minutes-desc',

  // Two-pass settings
  twoPassEnabled: true,
  firstPassLimit: 3,
  secondPassLimit: 6,

  // Grade grouping
  gradeGroupingEnabled: true,
  gradeGroupingWeight: 0.3,

  // Optimization
  enableOptimization: true,
  enableParallelProcessing: false,
  maxRetries: 3,
};
```

## Migration Path

### Option 1: Use Refactored Version (Recommended)

The refactored `OptimizedScheduler` automatically delegates to the new components:

```typescript
// No code changes needed - uses refactored version by default
const scheduler = new OptimizedScheduler(providerId, providerRole);
await scheduler.initializeContext(schoolSite);
const result = await scheduler.scheduleBatch(students);
```

### Option 2: Direct Component Usage

For more control, use components directly:

```typescript
const coordinator = new SchedulingCoordinator({
  engineConfig: {
    enableOptimization: true,
    maxRetries: 3,
  },
  constraints: {
    maxConcurrentSessions: 6,
    maxConsecutiveMinutes: 60,
    minBreakMinutes: 30,
  },
});

await coordinator.initialize(providerId, providerRole, schoolSite);
const result = await coordinator.scheduleBatch(students);
```

## Testing

### Unit Testing

Each component can be tested independently:

```typescript
// Test constraint validation
const validator = new ConstraintValidator();
const result = validator.validateConsecutiveSessionLimits(slot, sessions, student);

// Test distribution
const distributor = new SessionDistributor();
const slots = distributor.distributeTwoPass(3, availableSlots);

// Test engine
const engine = new SchedulingEngine();
const optimal = engine.findOptimalSlots(student, slots, constraints, context);
```

### Integration Testing

Test the complete flow:

```typescript
const coordinator = new SchedulingCoordinator();
await coordinator.initialize(providerId, providerRole, schoolSite);

// Test single student
const singleResult = await coordinator.scheduleStudent(student);

// Test batch
const batchResult = await coordinator.scheduleBatch(students);

// Verify metrics
const metrics = coordinator.getMetrics();
console.log('Validation count:', metrics.validator.validationCount);
console.log('Distribution time:', metrics.distributor.averageDistributionTime);
console.log('Success rate:', metrics.engine.successRate);
```

## Performance Improvements

### O(1) Constraint Lookups

Bell schedules and special activities are now indexed for instant lookup:

```typescript
// Before: O(n) search through all bell schedules
const conflicts = bellSchedules.filter(b => /* check overlap */);

// After: O(1) indexed lookup
const conflicts = bellSchedulesByGrade.get(grade)?.get(day) || [];
```

### Reduced Query Count

All data is cached in SchedulingDataManager:

- Initial queries: ~10-15
- Subsequent students: 0 queries (cache hits)

### Parallel Processing Ready

The architecture supports parallel processing (can be enabled in config):

```typescript
enableParallelProcessing: true; // Process multiple students concurrently
```

## Backward Compatibility

The refactored `OptimizedScheduler` maintains 100% backward compatibility:

- Same public API
- Same method signatures
- Same return types
- Existing code continues to work without changes

## Benefits

1. **Better Testability**: Each component can be tested in isolation
2. **Maintainability**: Clear separation of concerns
3. **Extensibility**: Easy to add new constraints or strategies
4. **Performance**: O(1) lookups, reduced queries, optimized algorithms
5. **Flexibility**: Mix and match components as needed

## Next Steps

1. Monitor performance metrics in production
2. Enable parallel processing if needed
3. Add custom distribution strategies
4. Implement additional constraints
5. Fine-tune optimization weights

## Troubleshooting

### Issue: Scheduling takes too long

- Check if optimization is enabled
- Review constraint validator metrics
- Consider enabling parallel processing

### Issue: Poor grade grouping

- Adjust `gradeGroupingWeight` in config
- Review distribution strategy selection
- Check student grade map population

### Issue: Too many concurrent sessions

- Verify `maxConcurrentSessions` setting
- Check capacity calculations
- Review constraint validation

## Support

For issues or questions about Phase 3 implementation:

1. Review component documentation
2. Check performance metrics
3. Enable debug logging
4. Contact the development team
