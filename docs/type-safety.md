# Type Safety Standards

## Nullable Field Handling Guidelines

This document establishes consistent patterns for handling nullable fields throughout the application.

### Core Principle

**Database schema allows nulls for flexibility, but application logic should be strict about what values it accepts.**

---

## When to Use Each Pattern

### 1. Optional Chaining (`?.`)

**Use when:** The null value is acceptable and you want to safely access nested properties.

```typescript
// ✅ Good: Accessing optional nested data
const email = teacher?.account?.email;
const count = students?.length ?? 0;
```

**Don't use when:** The field is logically required for the operation to succeed.

```typescript
// ❌ Bad: Required field treated as optional
const date = new Date(session?.scheduled_date); // Could create Invalid Date
```

---

### 2. Nullish Coalescing (`??`)

**Use when:** You have a sensible default value for null/undefined.

```typescript
// ✅ Good: Providing defaults
const minutes = session.minutes_per_session ?? 30;
const classroom = teacher.classroom_number ?? 'TBD';
```

**Don't use when:** There's no reasonable default (should error instead).

```typescript
// ❌ Bad: Hiding a data quality issue
const studentId = session.student_id ?? 'unknown'; // Should throw error
```

---

### 3. Non-Null Assertion (`!`)

**Use when:** You have runtime assurance the value won't be null (e.g., after a check).

```typescript
// ✅ Good: After validation
if (!session.scheduled_date) {
  throw new Error('Session must have a scheduled date');
}
const date = new Date(session.scheduled_date!);
```

**Don't use when:** You're just hoping it's not null.

```typescript
// ❌ Bad: Wishful thinking
const date = new Date(session.scheduled_date!); // Might still be null
```

---

### 4. Validation Functions (`requireNonNull`, `requireDate`)

**Use when:** A field is logically required and null indicates a data error.

```typescript
// ✅ Good: Explicit validation with clear error
import { requireNonNull, requireDate } from '@/lib/types/utils';

const studentId = requireNonNull(session.student_id, 'student_id');
const date = requireDate(session.scheduled_date, 'scheduled_date');
```

**Use for:**

- Database query results that should never be null
- Required function parameters
- Critical business logic fields

---

### 5. Type Guards (`isNonNull`)

**Use when:** Filtering arrays or checking before operations.

```typescript
// ✅ Good: Array filtering
import { filterNulls } from '@/lib/types/utils';

const validSessions = sessions.filter(s => s.scheduled_date !== null);
// Or
const validSessions = filterNulls(sessions.map(s => s.scheduled_date));
```

---

## Field-Specific Guidelines

### Dates

**Problem:** Database stores dates as `string | null`, but `new Date(null)` creates Invalid Date.

**Solutions:**

```typescript
// Option 1: Parse safely with null result
import { parseDateOrNull } from '@/lib/types/utils';
const date = parseDateOrNull(session.scheduled_date);
if (!date) {
  // Handle null case
}

// Option 2: Require non-null date
import { requireDate } from '@/lib/types/utils';
const date = requireDate(session.scheduled_date, 'scheduled_date'); // Throws if null

// Option 3: Provide default
const date = session.scheduled_date ? new Date(session.scheduled_date) : new Date();
```

### IDs (student_id, teacher_id, etc.)

**Problem:** IDs should never be null in active records, but database allows it.

**Solution:** Validate at query layer

```typescript
import { requireNonNull } from '@/lib/types/utils';

// In query function
export async function getStudent(id: string) {
  const result = await supabase.from('students').select('*').eq('id', id).single();

  if (result.error || !result.data) {
    throw new Error('Student not found');
  }

  // Validate required fields
  const student = result.data;
  requireNonNull(student.provider_id, 'provider_id');
  requireNonNull(student.teacher_id, 'teacher_id');

  return student as RequireFields<Student, 'provider_id' | 'teacher_id'>;
}
```

### Numeric Fields (sessions_per_week, minutes_per_session)

**Problem:** Nulls in numeric calculations produce NaN.

**Solution:** Provide defaults or validate

```typescript
import { parseNumberOrDefault } from '@/lib/types/utils';

// Option 1: Default value
const minutes = parseNumberOrDefault(session.minutes_per_session, 30);
const hours = minutes / 60; // Safe calculation

// Option 2: Validate if truly required
if (session.minutes_per_session === null) {
  throw new Error('Session duration is required');
}
const hours = session.minutes_per_session / 60;
```

### Text Fields (names, emails, descriptions)

**Problem:** Empty strings vs null have different meanings.

**Solution:** Normalize to non-empty or error

```typescript
import { requireNonEmptyString, withDefault } from '@/lib/types/utils';

// Option 1: Required field
const lastName = requireNonEmptyString(teacher.last_name, 'last_name');

// Option 2: Optional with default
const classroom = withDefault(teacher.classroom_number, 'Not Assigned');
```

---

## Layer-Specific Patterns

### Query Layer (`lib/supabase/queries/*`)

**Responsibility:** Transform database nullability to application requirements

```typescript
export async function getActiveStudents(providerId: string) {
  const { data, error } = await supabase.from('students').select('*').eq('provider_id', providerId);

  if (error) throw error;

  // Validate and transform
  return (data || []).map(student => {
    requireNonNull(student.teacher_id, 'teacher_id');
    requireNonNull(student.grade_level, 'grade_level');

    return {
      ...student,
      teacher_id: student.teacher_id!,
      grade_level: student.grade_level!,
      sessions_per_week: student.sessions_per_week ?? 1,
      minutes_per_session: student.minutes_per_session ?? 30,
    };
  });
}
```

### Service Layer (`lib/services/*`, `lib/scheduling/*`)

**Responsibility:** Business logic assumes validated data

```typescript
export async function updateSession(sessionId: string, updates: SessionUpdate) {
  // Validate inputs
  requireNonNull(updates.scheduled_date, 'scheduled_date');

  // Business logic operates on non-null values
  const date = requireDate(updates.scheduled_date, 'scheduled_date');

  // ... rest of logic
}
```

### Component Layer (`app/components/*`)

**Responsibility:** Defensive rendering, user-friendly fallbacks

```typescript
export function SessionCard({ session }: { session: ScheduleSession }) {
  // Defensive: use optional chaining for display
  const date = session.scheduled_date
    ? new Date(session.scheduled_date).toLocaleDateString()
    : 'Not scheduled';

  const duration = session.minutes_per_session ?? 30;

  return (
    <div>
      <p>Date: {date}</p>
      <p>Duration: {duration} minutes</p>
    </div>
  );
}
```

---

## Type Definition Patterns

### Database Types (from generated schema)

```typescript
// src/types/database.ts
type Student = Database['public']['Tables']['students']['Row'];
// Has nullable fields: provider_id: string | null
```

### Application Types (for business logic)

```typescript
// lib/types/student.ts
import type { RequireFields } from '@/lib/types/utils';
import type { Student as DBStudent } from '@/src/types/database';

// Application-level Student with required fields
export type Student = RequireFields<DBStudent, 'provider_id' | 'teacher_id' | 'grade_level'>;
```

---

## Common Anti-Patterns to Avoid

### ❌ Silent Null Propagation

```typescript
// Bad: Null propagates through calculations
const hours = session.minutes_per_session / 60; // NaN if null
```

### ❌ Trusting Database Without Validation

```typescript
// Bad: Assuming database enforces non-null
const date = new Date(session.scheduled_date); // Could be Invalid Date
```

### ❌ Using `as` Casts to Silence Errors

```typescript
// Bad: Hiding type errors
const student = data as Student; // Data might have nulls
```

### ❌ Mixing Patterns Inconsistently

```typescript
// Bad: Using different patterns for same type of field
const name1 = teacher.first_name!; // Non-null assertion
const name2 = teacher.last_name ?? 'Unknown'; // Nullish coalescing
```

---

## Migration Checklist

When fixing nullable type errors:

- [ ] Identify if the field is logically required or optional
- [ ] Choose appropriate pattern from guidelines above
- [ ] Add validation at the data layer (queries)
- [ ] Use consistent pattern across similar fields
- [ ] Test both null and non-null cases
- [ ] Document any assumptions about nullability

---

## Questions to Ask

1. **Can this field ever be legitimately null in production?**
   - Yes → Use optional chaining or defaults
   - No → Use validation/throw error

2. **What should happen if this field is null?**
   - Show fallback UI → Use nullish coalescing
   - Skip/filter item → Use type guard
   - Throw error → Use `requireNonNull`

3. **Is this an old record or new record?**
   - Old (legacy) → More lenient, use defaults
   - New (current) → Strict, require non-null

4. **Does null have business meaning?**
   - Yes (e.g., "not assigned yet") → Preserve null, handle in UI
   - No (data quality issue) → Validate and error

---

This document is living and should be updated as new patterns emerge.
