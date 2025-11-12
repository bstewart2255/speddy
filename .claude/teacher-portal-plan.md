# Teacher Portal Implementation Plan

## Overview

This document outlines the implementation plan for a general education teacher portal within the Speddy application. The portal will enable general education teachers to collaborate more effectively with resource specialists by managing special activities, viewing student schedules, and sharing work materials.

---

## User Requirements

### Core Features

1. **Special Activities Management**: Teachers can create class-specific special activity items that populate in the Resource Specialist's "Special Activities" section in Schedule
2. **Student Visibility**: Teachers can see which of their students are in resource, when they're scheduled, and what their IEP goals are
3. **Shared Work Library**: Teachers can upload work for students to do in resource (shared library model, no approval required)

### User Preferences (from discovery questions)

- **IEP Goals Display**: Full IEP goals visible to general education teachers
- **Work Upload Model**: Shared library (no approval bottleneck)
- **Scheduling Access**: View-only (teachers can see when students are pulled but don't modify schedules)
- **RS Visibility**: Show Resource Specialist name only (no contact info)
- **Student Model**: Keep current 1:1 relationship (one teacher per student)
- **Account Setup**: Admin-created accounts
- **Historical Data**: No historical data access (current schedule and IEP goals only)

---

## Current Architecture Analysis

### Database Schema (Relevant Tables)

**Profiles Table:**

- Current roles: `'resource'`, `'speech'`, `'ot'`, `'counseling'`, `'specialist'`, `'sea'`
- **Gap**: No `'teacher'` role for general education teachers
- Fields: `id`, `email`, `full_name`, `role`, `school_id`, `district_id`, `state_id`, `works_at_multiple_schools`

**Students Table:**

- Fields: `id`, `provider_id`, `initials`, `grade_level`, `teacher_name`, `teacher_id`, `sessions_per_week`, `minutes_per_session`, `school_id`
- Relationship: `students.teacher_id` → `teachers.id`
- Constraint: Unique on `(provider_id, initials, grade_level, teacher_name)`

**Student Details Table:**

- Fields: `student_id`, `first_name`, `last_name`, `iep_goals` (ARRAY), `upcoming_iep_date`, `working_skills` (JSONB)
- Contains sensitive IEP information

**Special Activities Table:**

- Fields: `id`, `provider_id`, `teacher_name`, `day_of_week`, `start_time`, `end_time`, `activity_name`, `school_id`
- Currently: Created by resource specialists for various teachers
- **Gap**: No field to distinguish teacher-created vs RS-created activities

**Schedule Sessions Table:**

- Fields: `id`, `provider_id`, `student_id`, `day_of_week`, `start_time`, `end_time`, `service_type`, `status`, `group_id`
- Contains actual resource service schedule

### Authentication & Authorization

- **System**: Supabase Auth with JWT
- **Middleware**: `/home/runner/workspace/middleware.ts` validates sessions and sets headers
- **RLS**: Row-Level Security enabled on all tables, scoped to provider
- **Public Routes**: `/login`, `/signup`, `/terms`, `/privacy`, `/ferpa`

### School Context Pattern

- **Provider**: `/app/components/providers/school-context.tsx`
- **Multi-School Support**: Providers can work at multiple schools with `provider_schools` junction table
- **Filtering Pattern**: Use `school_id` (migrated schools) with fallback to `school_site`/`school_district` (legacy)
- **Teachers**: Should be single-school (no multi-school complexity needed)

### Existing Components to Reuse

- **UI Components**: Card, Table, Button, Input, etc. (in `/app/components/ui/`)
- **Schedule Grid**: `/app/components/schedule/schedule-grid.tsx`
- **Special Activities UI**: `/app/(dashboard)/dashboard/special-activities/page.tsx`
- **AI Upload**: `/app/components/ai-upload/` for file uploads
- **Filter Components**: `/app/components/schedule/filter-select.tsx`

---

## Implementation Plan

## Phase 1: Core Infrastructure & Authentication

### 1.1 Database Schema Changes

#### Add Teacher Role to Profiles

```sql
-- Migration: Add 'teacher' to role enum
ALTER TYPE user_role ADD VALUE 'teacher';

-- Update profiles table comment
COMMENT ON COLUMN profiles.role IS 'User role: resource, speech, ot, counseling, specialist, sea, or teacher';
```

#### Create Teacher Profiles Table

```sql
CREATE TABLE public.teacher_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  school_id varchar REFERENCES public.schools(id),
  grade_levels_taught varchar[] DEFAULT '{}',
  room_number varchar,
  phone_extension varchar,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.teacher_profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Teachers can see their own profile
CREATE POLICY "Teachers can view own profile"
ON public.teacher_profiles FOR SELECT
TO authenticated
USING (teacher_id = auth.uid());

-- RLS Policy: Admins can manage teacher profiles
CREATE POLICY "Admins can manage teacher profiles"
ON public.teacher_profiles FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('resource', 'specialist')
  )
);

-- Index for performance
CREATE INDEX idx_teacher_profiles_teacher_id ON public.teacher_profiles(teacher_id);
CREATE INDEX idx_teacher_profiles_school_id ON public.teacher_profiles(school_id);

COMMENT ON TABLE public.teacher_profiles IS 'Extended profile information for general education teachers';
```

#### Update Special Activities Table

```sql
-- Add field to track who created the activity
ALTER TABLE public.special_activities
ADD COLUMN created_by_role user_role,
ADD COLUMN created_by_id uuid REFERENCES public.profiles(id);

-- Backfill existing records (all created by resource specialists)
UPDATE public.special_activities
SET created_by_role = 'resource',
    created_by_id = provider_id
WHERE created_by_role IS NULL;

-- Add index
CREATE INDEX idx_special_activities_created_by ON public.special_activities(created_by_id, created_by_role);

COMMENT ON COLUMN public.special_activities.created_by_role IS 'Role of user who created this activity (resource or teacher)';
COMMENT ON COLUMN public.special_activities.created_by_id IS 'User ID who created this activity';
```

#### Update RLS Policies for Teachers

**Students Table:**

```sql
-- Teachers can see their own students at their school
CREATE POLICY "Teachers see their own students"
ON public.students FOR SELECT
TO authenticated
USING (
  (
    -- Teacher viewing their own students
    teacher_id IN (
      SELECT id FROM teachers
      WHERE provider_id = auth.uid()
    )
  )
  OR
  (
    -- Resource specialists can still see all their students
    provider_id = auth.uid()
  )
);
```

**Student Details Table:**

```sql
-- Teachers can see IEP details for their students
CREATE POLICY "Teachers see IEP goals for their students"
ON public.student_details FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT id FROM students
    WHERE teacher_id IN (
      SELECT id FROM teachers
      WHERE provider_id = auth.uid()
    )
  )
  OR
  student_id IN (
    SELECT id FROM students
    WHERE provider_id = auth.uid()
  )
);
```

**Special Activities Table:**

```sql
-- Teachers can create and manage their own special activities
CREATE POLICY "Teachers manage their own special activities"
ON public.special_activities FOR ALL
TO authenticated
USING (
  (created_by_id = auth.uid() AND created_by_role = 'teacher')
  OR
  (provider_id = auth.uid() AND created_by_role = 'resource')
)
WITH CHECK (
  (created_by_id = auth.uid() AND created_by_role = 'teacher')
  OR
  (provider_id = auth.uid() AND created_by_role = 'resource')
);

-- Teachers and resource specialists can view all activities at their school
CREATE POLICY "View school activities"
ON public.special_activities FOR SELECT
TO authenticated
USING (
  school_id IN (
    SELECT school_id FROM profiles WHERE id = auth.uid()
  )
);
```

**Schedule Sessions Table:**

```sql
-- Teachers can view sessions for their students
CREATE POLICY "Teachers view student sessions"
ON public.schedule_sessions FOR SELECT
TO authenticated
USING (
  student_id IN (
    SELECT id FROM students
    WHERE teacher_id IN (
      SELECT id FROM teachers
      WHERE provider_id = auth.uid()
    )
  )
  OR
  provider_id = auth.uid()
);
```

### 1.2 Authentication & Middleware Updates

#### Update Middleware for Teacher Role

File: `/home/runner/workspace/middleware.ts`

Add teacher-specific routes to protected paths:

```typescript
// Add to protected routes
const teacherRoutes = [
  '/dashboard/teacher',
  '/dashboard/teacher/my-students',
  '/dashboard/teacher/special-activities',
];

// In middleware logic, redirect teachers to teacher dashboard
if (userRole === 'teacher' && !pathname.startsWith('/dashboard/teacher')) {
  return NextResponse.redirect(new URL('/dashboard/teacher', request.url));
}
```

#### Create Teacher Signup/Invitation Flow

- Admin UI for creating teacher accounts (future)
- For now: Manual database insert or simple form for admins

### 1.3 Teacher Dashboard Layout

#### File Structure

```
app/
  (dashboard)/
    dashboard/
      teacher/
        page.tsx                          # Teacher dashboard home
        my-students/
          page.tsx                        # Students in resource view
          [studentId]/
            page.tsx                      # Individual student detail
        special-activities/
          page.tsx                        # Special activities management
        layout.tsx                        # Teacher-specific layout
```

#### Teacher Layout Component

File: `/app/(dashboard)/dashboard/teacher/layout.tsx`

```typescript
'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    const checkTeacherRole = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/login');
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile?.role !== 'teacher') {
        router.push('/dashboard');
        return;
      }

      setLoading(false);
    };

    checkTeacherRole();
  }, [router, supabase]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Teacher Navigation */}
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex space-x-8">
              <a href="/dashboard/teacher" className="inline-flex items-center px-1 pt-1 text-sm font-medium">
                Dashboard
              </a>
              <a href="/dashboard/teacher/my-students" className="inline-flex items-center px-1 pt-1 text-sm font-medium">
                My Students
              </a>
              <a href="/dashboard/teacher/special-activities" className="inline-flex items-center px-1 pt-1 text-sm font-medium">
                Special Activities
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-8">
        {children}
      </main>
    </div>
  );
}
```

---

## Phase 2: Core Features

### 2.1 View Students in Resource

#### Create Query Functions

File: `/lib/supabase/queries/teachers.ts`

```typescript
import { createClient } from '@/lib/supabase/server';

/**
 * Get students assigned to the current teacher that are in resource
 */
export async function getMyStudentsInResource(teacherId: string, schoolId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('students')
    .select(
      `
      id,
      initials,
      grade_level,
      sessions_per_week,
      minutes_per_session,
      student_details (
        iep_goals,
        upcoming_iep_date
      ),
      profiles!students_provider_id_fkey (
        full_name
      )
    `
    )
    .eq('teacher_id', teacherId)
    .eq('school_id', schoolId)
    .order('grade_level', { ascending: true })
    .order('initials', { ascending: true });

  if (error) {
    console.error('Error fetching teacher students:', error);
    return [];
  }

  return data || [];
}

/**
 * Get resource schedule for a specific student
 */
export async function getStudentResourceSchedule(studentId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('schedule_sessions')
    .select('*')
    .eq('student_id', studentId)
    .eq('status', 'active')
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching student schedule:', error);
    return [];
  }

  return data || [];
}

/**
 * Get teacher's special activities
 */
export async function getMySpecialActivities(teacherId: string, schoolId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('special_activities')
    .select('*')
    .eq('created_by_id', teacherId)
    .eq('school_id', schoolId)
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching teacher activities:', error);
    return [];
  }

  return data || [];
}
```

#### My Students Page

File: `/app/(dashboard)/dashboard/teacher/my-students/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardBody } from '@/app/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/app/components/ui/table';
import { GradeTag } from '@/app/components/ui/tag';
import Link from 'next/link';

type StudentInResource = {
  id: string;
  initials: string;
  grade_level: string;
  sessions_per_week: number;
  minutes_per_session: number;
  student_details: {
    iep_goals: string[];
    upcoming_iep_date: string | null;
  }[];
  profiles: {
    full_name: string;
  };
};

export default function MyStudentsPage() {
  const [students, setStudents] = useState<StudentInResource[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchStudents = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', user.id)
        .single();

      if (!profile?.school_id) return;

      // Get teacher ID from teachers table
      const { data: teacher } = await supabase
        .from('teachers')
        .select('id')
        .eq('provider_id', user.id)
        .single();

      if (!teacher) return;

      // Fetch students
      const { data: studentsData, error } = await supabase
        .from('students')
        .select(`
          id,
          initials,
          grade_level,
          sessions_per_week,
          minutes_per_session,
          student_details (
            iep_goals,
            upcoming_iep_date
          ),
          profiles!students_provider_id_fkey (
            full_name
          )
        `)
        .eq('teacher_id', teacher.id)
        .eq('school_id', profile.school_id)
        .order('grade_level', { ascending: true })
        .order('initials', { ascending: true });

      if (error) {
        console.error('Error fetching students:', error);
      } else {
        setStudents(studentsData || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading students...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">My Students in Resource</h1>
        <p className="text-gray-600">View your students receiving resource services</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Students ({students.length})</CardTitle>
        </CardHeader>
        <CardBody>
          {students.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              No students currently receiving resource services.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Resource Specialist</TableHead>
                  <TableHead>Sessions/Week</TableHead>
                  <TableHead>Minutes/Session</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.initials}</TableCell>
                    <TableCell>
                      <GradeTag grade={student.grade_level} />
                    </TableCell>
                    <TableCell>{student.profiles?.full_name || 'N/A'}</TableCell>
                    <TableCell>{student.sessions_per_week}</TableCell>
                    <TableCell>{student.minutes_per_session} min</TableCell>
                    <TableCell>
                      <Link
                        href={`/dashboard/teacher/my-students/${student.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View Details
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

#### Student Detail Page

File: `/app/(dashboard)/dashboard/teacher/my-students/[studentId]/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardBody } from '@/app/components/ui/card';
import { GradeTag } from '@/app/components/ui/tag';
import { useParams } from 'next/navigation';

type StudentDetail = {
  id: string;
  initials: string;
  grade_level: string;
  sessions_per_week: number;
  minutes_per_session: number;
  student_details: {
    iep_goals: string[];
    upcoming_iep_date: string | null;
  }[];
  profiles: {
    full_name: string;
  };
};

type ScheduleSession = {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  service_type: string;
};

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.studentId as string;
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [schedule, setSchedule] = useState<ScheduleSession[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchStudentData = useCallback(async () => {
    try {
      // Fetch student details
      const { data: studentData, error: studentError } = await supabase
        .from('students')
        .select(`
          id,
          initials,
          grade_level,
          sessions_per_week,
          minutes_per_session,
          student_details (
            iep_goals,
            upcoming_iep_date
          ),
          profiles!students_provider_id_fkey (
            full_name
          )
        `)
        .eq('id', studentId)
        .single();

      if (studentError) {
        console.error('Error fetching student:', studentError);
        return;
      }

      setStudent(studentData);

      // Fetch schedule
      const { data: scheduleData, error: scheduleError } = await supabase
        .from('schedule_sessions')
        .select('id, day_of_week, start_time, end_time, service_type')
        .eq('student_id', studentId)
        .eq('status', 'active')
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (scheduleError) {
        console.error('Error fetching schedule:', scheduleError);
      } else {
        setSchedule(scheduleData || []);
      }
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase, studentId]);

  useEffect(() => {
    fetchStudentData();
  }, [fetchStudentData]);

  const formatTime = (time: string) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getDayName = (dayNumber: number) => {
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    return days[dayNumber - 1] || 'Unknown';
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading student details...</p>
        </div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12 text-gray-500">
          Student not found.
        </div>
      </div>
    );
  }

  const iepGoals = student.student_details?.[0]?.iep_goals || [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Student: {student.initials}</h1>
        <div className="flex items-center gap-4 mt-2">
          <GradeTag grade={student.grade_level} />
          <span className="text-gray-600">
            Resource Specialist: <strong>{student.profiles?.full_name || 'N/A'}</strong>
          </span>
        </div>
      </div>

      {/* IEP Goals */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>IEP Goals</CardTitle>
        </CardHeader>
        <CardBody>
          {iepGoals.length === 0 ? (
            <p className="text-gray-500 italic">No IEP goals recorded.</p>
          ) : (
            <ul className="space-y-3">
              {iepGoals.map((goal, index) => (
                <li key={index} className="flex gap-3">
                  <span className="font-semibold text-gray-700">{index + 1}.</span>
                  <span className="text-gray-800">{goal}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Resource Schedule */}
      <Card>
        <CardHeader>
          <CardTitle>Weekly Resource Schedule</CardTitle>
        </CardHeader>
        <CardBody>
          {schedule.length === 0 ? (
            <p className="text-gray-500 italic">No scheduled sessions.</p>
          ) : (
            <div className="space-y-3">
              {schedule.map((session) => (
                <div key={session.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{getDayName(session.day_of_week)}</p>
                    <p className="text-sm text-gray-600">{session.service_type}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-gray-900">
                      {formatTime(session.start_time)} - {formatTime(session.end_time)}
                    </p>
                    <p className="text-sm text-gray-600">
                      {Math.round((new Date(`1970-01-01T${session.end_time}`) - new Date(`1970-01-01T${session.start_time}`)) / 60000)} minutes
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
```

### 2.2 Special Activities Management

File: `/app/(dashboard)/dashboard/teacher/special-activities/page.tsx`

This page will largely reuse the existing special activities UI from `/app/(dashboard)/dashboard/special-activities/page.tsx` with the following modifications:

1. Filter to show only activities created by the current teacher
2. Set `created_by_role = 'teacher'` and `created_by_id = current_user_id` when creating activities
3. Remove the "teacher name" selector (auto-populate from current teacher's profile)

---

## Phase 3: Shared Work Library (Future Implementation)

### 3.1 Database Schema

```sql
-- Shared work library table
CREATE TABLE public.shared_work_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id varchar REFERENCES public.schools(id),
  uploaded_by_id uuid REFERENCES public.profiles(id),
  uploaded_by_role user_role,
  title varchar NOT NULL,
  description text,
  subject varchar CHECK (subject IN ('ELA', 'Math')),
  grade_levels varchar[] DEFAULT '{}',
  file_path varchar NOT NULL,
  mime_type varchar,
  file_size bigint,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.shared_work_library ENABLE ROW LEVEL SECURITY;

-- Teachers can upload and view library items at their school
CREATE POLICY "Teachers manage shared work library"
ON public.shared_work_library FOR ALL
TO authenticated
USING (
  school_id IN (
    SELECT school_id FROM profiles WHERE id = auth.uid()
  )
);

-- Indexes
CREATE INDEX idx_shared_work_library_school ON public.shared_work_library(school_id);
CREATE INDEX idx_shared_work_library_uploaded_by ON public.shared_work_library(uploaded_by_id);
CREATE INDEX idx_shared_work_library_subject ON public.shared_work_library(subject);

-- Comments
COMMENT ON TABLE public.shared_work_library IS 'Shared library of work materials uploaded by teachers for resource specialists';
```

### 3.2 Upload Interface

- Reuse AI upload modal pattern from `/app/components/ai-upload/`
- Store files in Supabase Storage bucket: `shared-work-library`
- Path structure: `{school_id}/{uploaded_by_id}/{filename}`

### 3.3 Resource Specialist View

Add new tab in RS dashboard to view shared work library:

- Filter by subject, grade level, teacher, date
- Download/preview files
- "Assign to Student" button (future feature)

---

## Security Considerations

### Data Access Controls

1. **Teachers can ONLY see**:
   - Students where `teacher_id` matches their teacher record
   - Students at their assigned school
   - IEP goals for their students (full visibility as requested)
   - Resource schedule (view-only)
   - Resource Specialist name (no contact info)

2. **Teachers CANNOT see**:
   - Students from other teachers or schools
   - Resource Specialist email, phone, or personal info
   - Session notes or progress tracking
   - Historical data (exit tickets, assessments, etc.)

3. **Audit Logging**:
   - Log all IEP goal views by teachers (FERPA compliance)
   - Track who uploads shared work materials
   - Record when teachers create special activities

### RLS (Row-Level Security)

- All tables have RLS enabled
- Teachers can only query data scoped to:
  - Their teacher ID
  - Their school ID
  - Their students

### FERPA Compliance

- IEP data access is logged
- Only authorized teachers (those assigned to student) can view IEP goals
- No export/print functionality for IEP data (prevent unauthorized distribution)

---

## Migration Checklist

### Database Migrations

- [ ] Add `'teacher'` role to `user_role` enum
- [ ] Create `teacher_profiles` table
- [ ] Update `special_activities` table (add `created_by_role`, `created_by_id`)
- [ ] Add RLS policies for teachers on `students` table
- [ ] Add RLS policies for teachers on `student_details` table
- [ ] Add RLS policies for teachers on `special_activities` table
- [ ] Add RLS policies for teachers on `schedule_sessions` table
- [ ] Backfill existing `special_activities` with `created_by_role = 'resource'`

### Code Changes

- [ ] Update middleware to handle teacher role routing
- [ ] Create teacher dashboard layout (`/dashboard/teacher/layout.tsx`)
- [ ] Create teacher dashboard home page (`/dashboard/teacher/page.tsx`)
- [ ] Create "My Students" page (`/dashboard/teacher/my-students/page.tsx`)
- [ ] Create student detail page (`/dashboard/teacher/my-students/[studentId]/page.tsx`)
- [ ] Create special activities page (`/dashboard/teacher/special-activities/page.tsx`)
- [ ] Create teacher query functions (`/lib/supabase/queries/teachers.ts`)
- [ ] Add teacher navigation component
- [ ] Update special activities form to support teacher creation

### Admin Features (Future)

- [ ] Admin UI for creating teacher accounts
- [ ] Teacher invitation email system
- [ ] Bulk teacher import (CSV)

---

## Testing Plan

### Manual Testing Scenarios

1. **Teacher Login & Navigation**
   - [ ] Teacher can log in with credentials
   - [ ] Teacher is redirected to `/dashboard/teacher`
   - [ ] Teacher cannot access resource specialist dashboard
   - [ ] Navigation links work correctly

2. **View Students**
   - [ ] Teacher sees only their assigned students
   - [ ] Student list shows correct RS name
   - [ ] IEP goals display correctly
   - [ ] Schedule shows active sessions only

3. **Special Activities**
   - [ ] Teacher can create new special activity
   - [ ] Activity appears in RS schedule view
   - [ ] Teacher can delete their own activities
   - [ ] Teacher cannot delete RS-created activities

4. **Security**
   - [ ] Teacher cannot see other teachers' students
   - [ ] Teacher cannot access students from other schools
   - [ ] RLS prevents unauthorized data access
   - [ ] Direct URL access to other students is blocked

5. **Edge Cases**
   - [ ] Teacher with no students sees appropriate message
   - [ ] Student with no IEP goals shows "No IEP goals recorded"
   - [ ] Student with no schedule shows "No scheduled sessions"

---

## Estimated Timeline

### Phase 1: Core Infrastructure (Week 1-2)

- Database migrations: 4-6 hours
- Authentication & middleware: 3-4 hours
- Teacher layout and navigation: 2-3 hours
- **Total: 10-15 hours**

### Phase 2: Core Features (Week 2-3)

- "My Students" page: 6-8 hours
- Student detail page: 4-6 hours
- Special activities management: 4-6 hours
- Query functions and hooks: 3-4 hours
- **Total: 17-24 hours**

### Phase 3: Testing & Refinement (Week 3)

- Manual testing: 4-6 hours
- Bug fixes: 4-6 hours
- UI/UX polish: 2-3 hours
- **Total: 10-15 hours**

### Phase 4: Shared Work Library (Week 4-5, Optional)

- Database schema: 2-3 hours
- Upload interface: 6-8 hours
- RS library view: 4-6 hours
- Testing: 3-4 hours
- **Total: 15-21 hours**

**Grand Total (Phases 1-3): 37-54 hours**
**With Shared Library (Phase 4): 52-75 hours**

---

## Future Enhancements

### Communication Features

- In-app messaging between teacher and RS
- Commenting on student progress
- Shared notes on IEP goals

### Advanced Notifications

- Email/SMS when student schedule changes
- Reminders for upcoming IEP dates
- Alerts when RS adds notes to shared work

### Analytics & Reports

- Student progress dashboard
- Time spent in resource services
- IEP goal completion tracking

### Calendar Integration

- Export special activities to Google Calendar/Outlook
- Sync resource schedule with teacher's calendar
- Automated conflict detection

### Mobile App

- Teacher mobile app for quick access
- Push notifications
- QR code check-in for resource sessions

---

## Notes & Open Questions

1. **Teacher Account Creation**: Currently planned as admin-created. Consider self-service signup with admin approval?

2. **Student-Teacher Relationship**: Keeping 1:1 model for now. If co-teaching becomes common, may need junction table.

3. **IEP Data Privacy**: Full visibility granted per requirements. Consider adding "view history" audit log for compliance.

4. **Shared Work Library**: Approval workflow not needed per requirements, but could add "featured" flag for RS to highlight recommended materials.

5. **Multi-School Teachers**: Currently assuming teachers work at one school. If this changes, add `teacher_schools` junction table similar to `provider_schools`.

---

## Success Metrics

### User Adoption

- % of teachers at each school using the portal
- Frequency of login (daily/weekly)
- Most-used features

### Efficiency Gains

- Reduction in email communication between teachers and RS
- Time saved on special activity management
- Faster IEP goal awareness

### Data Quality

- % of students with complete IEP goals
- % of special activities entered by teachers vs RS
- Shared work library usage stats

---

_Last Updated: 2025-11-11_
_Document Version: 1.0_
_Author: Claude (AI Assistant)_
