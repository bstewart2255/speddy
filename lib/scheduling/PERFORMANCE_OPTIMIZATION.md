# Scheduling Performance Optimization - Phase 1

## Problem Statement

The auto-scheduler feature had a critical N+1 query performance issue. When scheduling multiple students across multiple time slots, the system was making individual database queries for each constraint check, resulting in 100+ database calls per scheduling operation.

## Solution Overview

We've implemented a comprehensive caching and batch fetching strategy that reduces database queries from O(n\*m) to O(1), where n=sessions and m=time slots.

## Key Changes

### 1. Database Indexes

Created performance indexes in `/supabase/migrations/20250815_scheduling_performance_indexes.sql`:

- `idx_sessions_provider_day`: Optimizes session lookups by provider and day
- `idx_bell_schedules_provider_day`: Speeds up bell schedule constraint checks
- `idx_special_activities_provider_day`: Accelerates special activity lookups
- `idx_user_site_schedules_user_day`: Improves work schedule queries
- Additional composite indexes for complex joins

### 2. Batch Data Fetching

`SchedulingDataManager.loadAllData()` replaces the per-constraint queries with
one grouped load: five **branches** issued together via `Promise.all`, instead
of the 100+ the scheduler used to make. Branches are not reads — several issue a
second, dependent read (the school_id / legacy school_site dual match, and the
`provider_schools` lookup availability needs before it can filter by site), so
the load is about **nine reads across a two-round-trip critical path**.

**The `get_scheduling_data_batch` RPC described here is gone (SPE-305).** It was
meant to collapse that load into a single statement, and it never delivered data
to the client in either of its two forms:

- As committed (`20250815_scheduling_batch_rpc.sql`) it joined on
  `ps.school_site = p_school_site` — text to text, so it could run — but it
  returned camelCase keys (`workSchedule`, …) that `processBatchData`'s
  snake_case tests never matched, so nothing was cached (SPE-56).
- After an uncaptured rewrite (drift, SPE-116) the predicate became
  `uss.site_id = p_school_site` — uuid against text — which Postgres rejects at
  plan time, so it threw on every call. That body is reproduced in
  `20260722_harden_get_scheduling_data_batch.sql`, dating the failure to
  2026-07-22 at the latest.

Either way the app took the parallel path. It was dropped rather than repaired.

Do not "restore the optimization" without reading
`supabase/migrations/20260818_spe305_drop_get_scheduling_data_batch.sql` first.
A single-statement version must carry the school_id/legacy-school_site dual key
(SPE-463), the school_year scope (SPE-458), the `deleted_at` filter
(SPE-468/SPE-484) and the caller's expected key names (SPE-56), or it silently
under-reads and the auto-scheduler books over protected time. Those four are
production bugs already paid for once.

### 3. Enhanced Caching Structure

Added O(1) lookup Maps to `SchedulingContext`:

- `bellSchedulesByGrade`: Map<grade, Map<day, BellSchedule[]>>
- `specialActivitiesByTeacher`: Map<teacher, Map<day, SpecialActivity[]>>
- `providerAvailability`: Map<provider-school, Map<day, AvailabilitySlot[]>>

### 4. Optimized Constraint Validation

Updated constraint checking methods to use cached data:

- Bell schedule conflicts now use grade-indexed cache (O(1) lookup)
- Special activity conflicts use teacher-indexed cache (O(1) lookup)
- No database queries during constraint validation

### 5. Performance Telemetry

Added comprehensive performance tracking:

- Query counting (total, batch, cache hits/misses)
- Timing measurements for each operation
- Cache staleness detection
- Performance metrics API for monitoring

## Performance Results

### Before Optimization

- **Queries per scheduling operation**: 100-500+
- **Time per operation**: 2-5 seconds
- **Scalability**: Degraded with more students

### After Optimization

- **Queries per scheduling operation**: a small constant, not per-student
  - one grouped load — five branches issued together, a few of which make two
    sequential reads internally (the dual-key school match, the availability
    site lookup), so the critical path is about two round trips
  - 1 insert for saving sessions
- **Time per operation**: <500ms
- **Scalability**: Constant time regardless of student count

### Query Reduction

- **Reduction**: ~94% fewer database reads
- **Example**: Scheduling 5 students with 16 total sessions
  - Before: ~160 reads, issued serially
  - After: ~9 reads from five parallel branches, over a two-round-trip
    critical path, plus 1 insert

## Usage

```typescript
// Initialize scheduler
const scheduler = new OptimizedScheduler(providerId, providerRole);

// Initialize context (performs batch data fetch)
await scheduler.initializeContext(schoolSite);

// Schedule students (uses cached data, no additional queries)
const result = await scheduler.scheduleBatch(students);

// Check performance metrics
const metrics = scheduler.getPerformanceMetrics();
console.log(`Total queries: ${metrics.totalQueries}`);
console.log(`Cache hits: ${metrics.cacheHits}`);
```

## Testing

Run the performance test to verify query reduction:

```bash
npx ts-node lib/scheduling/optimized-scheduler.test.ts
```

## Migration Steps

1. Apply database migrations:
   - `20250815_scheduling_performance_indexes.sql` - Creates indexes
   - `20250815_scheduling_batch_rpc.sql` - Creates batch fetch function
2. Deploy updated `optimized-scheduler.ts`
3. Monitor performance metrics in production

## Backward Compatibility

- All existing method signatures maintained
- No changes to public API
- Manual drag-and-drop functionality unaffected
- Graceful fallback if RPC function not available

## Cache Management

- Cache TTL: 15 minutes (configurable)
- Automatic staleness detection
- Error tracking in cache metadata
- No cache invalidation needed during single scheduling session

## Next Steps (Future Phases)

- Phase 2: Implement Redis caching for cross-session persistence
- Phase 3: Add WebSocket updates for real-time schedule changes
- Phase 4: Implement predictive pre-caching based on usage patterns
