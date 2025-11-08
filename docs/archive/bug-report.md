# Bug Report - Application Analysis

**Generated:** September 29, 2025  
**Verification:** All issues verified via code inspection and Next.js documentation

---

## 🔴 CRITICAL PRIORITY

### 1. Security Vulnerability: Insecure Authentication in Middleware

**File:** `middleware.ts` (line 70)  
**Severity:** CRITICAL  
**Impact:** Authentication bypass possible - session data from cookies not server-verified

**Issue:**
The middleware uses `supabase.auth.getSession()` which reads directly from cookies without server verification. Supabase explicitly warns:

> "Using the user object as returned from supabase.auth.getSession() could be insecure! This value comes directly from the storage medium (usually cookies on the server) and may not be authentic. Use supabase.auth.getUser() instead which authenticates the data by contacting the Supabase Auth server."

**Current Code (middleware.ts:70-91):**

```typescript
// Refresh the session to ensure it's valid and update cookies
const {
  data: { session },
  error,
} = await supabase.auth.getSession();

// If no valid session and trying to access protected route, redirect to login
if (!session || error) {
  console.log('No valid session, redirecting to login', { error: error?.message });
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/login';
  return NextResponse.redirect(redirectUrl);
}

// Optionally verify the JWT token is not expired
const user = session.user;
if (!user) {
  console.log('No user in session, redirecting to login');
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/login';
  return NextResponse.redirect(redirectUrl);
}

// For authenticated users, pass the session info in headers
response.headers.set('x-user-id', user.id);
response.headers.set('x-user-email', user.email || '');
```

**Proposed Fix:**

```typescript
// Use getUser() to verify session with Supabase Auth server
const {
  data: { user },
  error,
} = await supabase.auth.getUser();

// If no valid user and trying to access protected route, redirect to login
if (!user || error) {
  console.log('No valid user, redirecting to login', { error: error?.message });
  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = '/login';
  return NextResponse.redirect(redirectUrl);
}

// For authenticated users, pass the user info in headers
response.headers.set('x-user-id', user.id);
response.headers.set('x-user-email', user.email || '');
```

**Notes:**

- This adds a network call to Supabase Auth server but is necessary for security
- E2E test bypass (lines 24-37) should remain unchanged with multiple safety checks

---

## 🟡 HIGH PRIORITY

### 2. Next.js Cross-Origin Development Warning

**File:** `next.config.js`  
**Severity:** HIGH  
**Impact:** Development warnings, future Next.js compatibility

**Issue:**
Console logs show repeated cross-origin warnings:

```
⚠ Cross origin request detected from 5faee751-09c0-4458-9b23-6dcaa389620e-00-1pp2bdaefsy4x.spock.replit.dev
to /_next/* resource. In a future major version of Next.js, you will need to explicitly configure
"allowedDevOrigins" in next.config to allow this.
```

**Current Replit Domain:** `5faee751-09c0-4458-9b23-6dcaa389620e-00-1pp2bdaefsy4x.spock.replit.dev`

**Proposed Fix:**
Add to `next.config.js` (before Sentry wrapper):

```javascript
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: false,
  },
  typescript: {
    ignoreBuildErrors: process.env.SKIP_TYPE_CHECK === 'true',
  },
  // Allow cross-origin dev requests from Replit domains
  allowedDevOrigins: [
    '*.replit.dev',    // Wildcard for all Replit dev domains
  ],
  webpack: config => {
    return config;
  },
};

// Then wrap with Sentry as usual
module.exports = shouldUseSentry ? withSentryConfig(nextConfig, ...) : nextConfig;
```

**Reference:** [Next.js allowedDevOrigins](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins) - wildcards are supported

### 3. Poor UX: Alert() Instead of Toast Notifications

**Files Affected:** 31+ files, 58+ instances  
**Severity:** HIGH  
**Impact:** User experience - blocking popups instead of elegant notifications

**Issue:**
Multiple components use browser `alert()` for error/success messages. These create blocking popups that interrupt user workflow and are inconsistent with the existing toast notification system.

**Toast Context API (verified in app/contexts/toast-context.tsx):**

```typescript
import { useToast } from '@/app/contexts/toast-context';

// In component:
const { showToast } = useToast();

// Usage:
showToast(message: string, type?: 'success' | 'error' | 'warning' | 'info', duration?: number)
```

**High Priority Files to Fix:**

**1. AI Upload Modal** (`app/components/ai-upload/ai-upload-modal.tsx`)

- Lines 79, 82, 97, 125, 128

**Example Fix (lines 79-82):**

```typescript
// Current:
} else {
  alert(result.error || 'Failed to process file');
}
} catch (error) {
  alert('Error uploading file. Please try again.');
}

// Fixed:
} else {
  showToast(result.error || 'Failed to process file', 'error');
}
} catch (error) {
  showToast('Error uploading file. Please try again.', 'error');
}
```

**2. Worksheet Utils** (`lib/utils/worksheet-utils.ts`)

- Lines 302, 361, 371, 470

**For utility functions, throw errors instead:**

```typescript
// Current (line 302):
alert(errorMessage);

// Fixed:
throw new Error(errorMessage);

// Then in calling UI component:
try {
  await worksheetUtil();
} catch (error) {
  showToast(error.message, 'error');
}
```

**3. Other High-Priority Files:**

- `app/components/ai-content-modal.tsx` (6 instances)
- `app/components/ai-content-modal-enhanced.tsx` (4 instances)
- `app/(dashboard)/dashboard/students/page.tsx` (6 instances)
- `app/components/calendar/calendar-week-view-dragversion.tsx` (3 instances)

**Complete File List (31+ files, 58+ instances):**

```
lib/utils/worksheet-utils.ts (4)
lib/supabase/hooks/use-schedule-operations.ts (2)
app/components/ai-content-modal.tsx (6)
app/components/ai-content-modal-enhanced.tsx (4)
app/components/todo-widget.tsx (1)
app/components/teachers/teacher-details-modal.tsx (1)
app/components/lessons/worksheet-button.tsx (2)
app/components/calendar/calendar-week-view-dragversion.tsx (3)
app/components/students/student-details-modal.tsx (1)
app/components/calendar/calendar-today-view-dragversion.tsx (2)
app/components/students/add-student-form.tsx (1)
app/components/settings/work-schedule.tsx (2)
app/components/students/csv-import.tsx (1)
app/components/settings/curriculums.tsx (2)
app/components/sea/session-completion.tsx (2)
app/components/students/students-list.tsx (1)
app/components/modals/manual-lesson-view-modal.tsx (1)
app/components/schedule/schedule-sessions.tsx (2)
app/components/special-activities/add-special-activity-form.tsx (1)
app/components/special-activities/csv-import.tsx (1)
app/components/bell-schedules/school-hours-form.tsx (1)
app/components/bell-schedules/add-bell-schedule-form.tsx (1)
app/components/bell-schedules/csv-import.tsx (1)
app/(dashboard)/admin/school-management/page.tsx (4)
app/(dashboard)/dashboard/calendar/page.tsx (2)
app/(dashboard)/dashboard/special-activities/page.tsx (1)
app/(dashboard)/dashboard/team/page.tsx (4)
app/(dashboard)/dashboard/bell-schedules/page.tsx (1)
app/(dashboard)/dashboard/students/page.tsx (6)
app/(dashboard)/dashboard/schedule/page.tsx (1)
app/(dashboard)/dashboard/schedule/page-original.tsx (3)
app/(dashboard)/dashboard/schedule/session-assignment-popup.tsx (1)
```

**Migration Strategy:**

1. Phase 1: High-traffic components (students, lessons, calendar)
2. Phase 2: Administrative and settings pages
3. Phase 3: Utility functions (throw errors, let UI catch and toast)

---

## 🟢 MEDIUM PRIORITY

### 4. Console Logging Instead of Structured Logger

**Files Affected:** Multiple  
**Severity:** MEDIUM  
**Impact:** Development noise, no production logging structure

**Issue:**
Extensive use of `console.log`, `console.error`, `console.warn` instead of the structured logger.

**Examples:**

- `middleware.ts:74, 83` - Console.log for auth failures
- `app/components/navigation/navbar.tsx:31, 52` - Console.log for role fetching
- `lib/utils/worksheet-utils.ts:294, 306` - Multiple debug console.log statements

**Existing Logger:** `lib/monitoring/logger.ts`

**Proposed Fix:**

```typescript
// Replace:
console.log('[Navbar] Fetching role for user:', user.id);

// With:
import { log } from '@/lib/monitoring/logger';
log.debug('Fetching role for user', { userId: user.id });
```

**Benefits:**

- Structured logging with context
- Log levels (debug, info, warn, error)
- Better filtering in production
- Integration with monitoring (Sentry)

### 5. Browser Console: Uncaught Exception

**Severity:** MEDIUM  
**Impact:** Unclear error source, potential runtime issues

**Browser Console Error:**

```javascript
Method -error:
1759186820086.0 - {"message":"An uncaught exception occured but the error was not an error object."}
```

**Investigation Needed:**

- Something is throwing a non-Error object
- Ensure all `throw` statements use Error objects: `throw new Error(message)`
- Add global error handler for better visibility

**Proposed Solution:**
Create `app/components/global-error-handler.tsx`:

```typescript
'use client';

import { useEffect } from 'react';
import { log } from '@/lib/monitoring/logger';

export function GlobalErrorHandler() {
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (!(event.error instanceof Error)) {
        log.error('Non-Error exception thrown', {
          error: event.error,
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
        });
      }
    };

    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  return null;
}
```

Then add to root layout or dashboard layout.

---

## 🔵 LOW PRIORITY

### 6. Webpack Critical Dependency Warning

**Source:** `@prisma/instrumentation` via Sentry  
**Severity:** LOW  
**Impact:** Build warnings only, no runtime effect

**Warning:**

```
⚠ ./node_modules/@prisma/instrumentation/node_modules/@opentelemetry/instrumentation/build/esm/platform/node/instrumentation.js
Critical dependency: the request of a dependency is an expression
```

**Note:** Known issue with Sentry/Prisma/OpenTelemetry integration. Can be safely ignored. Monitor for package updates.

---

## Summary

| Priority | Issues | Files Affected | Estimated Effort |
| -------- | ------ | -------------- | ---------------- |
| Critical | 1      | 1 file         | 30 min           |
| High     | 3      | 33+ files      | 4-6 hours        |
| Medium   | 2      | Multiple       | 2-3 hours        |
| Low      | 1      | Build only     | Monitor          |

## Recommended Action Plan

### Immediate (Today)

1. **FIX CRITICAL:** Update `middleware.ts` line 70
   ```typescript
   // Change from:
   const {
     data: { session },
     error,
   } = await supabase.auth.getSession();
   // To:
   const {
     data: { user },
     error,
   } = await supabase.auth.getUser();
   ```

   - Update subsequent logic to use `user` instead of `session.user`
   - Test login/logout flow
   - Verify E2E tests still work

### This Week

2. **Add allowedDevOrigins** to `next.config.js`

   ```javascript
   allowedDevOrigins: ['*.replit.dev'];
   ```

   - Restart dev server
   - Verify warning is gone

3. **Start Alert Migration** (Phase 1)
   - `app/components/ai-upload/ai-upload-modal.tsx` (5 alerts)
   - `app/(dashboard)/dashboard/students/page.tsx` (6 alerts)
   - `app/components/ai-content-modal.tsx` (6 alerts)
   - Test each component after changes

### Next Sprint

4. **Continue Alert Migration** (Phase 2 & 3)
   - Administrative pages
   - Utility functions (throw errors)
5. **Replace Console with Logger**
   - Start with auth flows (middleware, navbar)
   - Move to critical paths

6. **Add Global Error Handler**
   - Create component
   - Add to layout
   - Monitor for non-Error exceptions

### Backlog

7. Monitor Webpack warning for updates to Sentry/Prisma packages

---

## Notes for Review

- All line numbers verified against current codebase
- Toast API confirmed from `app/contexts/toast-context.tsx`
- Next.js config verified from [official docs](https://nextjs.org/docs/app/api-reference/config/next-config-js/allowedDevOrigins)
- Alert count from `grep -n 'alert(' across codebase`
