# Site Admin & School-Level Teacher Management Implementation

## Overview

This implementation adds Site Admin and District Admin roles to enable school-level account management for teachers and specialists. It addresses the problem of duplicate teachers being created by different resource specialists at the same school.

## Changes Implemented

### 1. Database Schema Changes

**Migration Files:**

- `20251112_add_admin_roles_and_school_scoped_teachers.sql`
- `20251112_migrate_special_activities_to_teacher_id.sql`

**Key Changes:**

- Added `site_admin` and `district_admin` roles to profiles
- Created `admin_permissions` table to track which schools/districts each admin manages
- Added `account_id` to teachers table to link teacher records to user accounts
- Added `created_by_admin` flag to distinguish admin-created vs auto-created teachers
- Added `teacher_id` to special_activities table (replacing text-based `teacher_name`)
- Updated RLS policies for school-level teacher visibility

**Teacher Access Model:**

- **OLD**: Teachers were scoped to the resource specialist who created them (`provider_id`)
- **NEW**: Teachers are scoped to the school (`school_id`) and visible to all staff at that school

### 2. Backend Query Functions

**New Files:**

- `lib/supabase/queries/admin-accounts.ts` - Admin account management functions
- `lib/supabase/queries/school-directory.ts` - School-wide teacher queries

**Key Functions:**

- `getCurrentAdminPermissions()` - Get current user's admin permissions
- `isAdminForSchool()` - Check if user is admin for a specific school
- `getSchoolStaff()` - Get all teachers and specialists at a school
- `createTeacherAccount()` - Create new teacher record with duplicate checking
- `checkDuplicateTeachers()` - Find similar teacher names at same school
- `findPotentialDuplicates()` - Scan for duplicate teachers across the school
- `getSchoolTeachers()` - Get all teachers at current user's school
- `searchTeachers()` - Search teachers by name (for autocomplete)

### 3. Admin Dashboard UI

**New Pages:**

- `/dashboard/admin` - Site Admin dashboard home
- `/dashboard/admin/teachers` - Teacher directory with search and filtering
- `/dashboard/admin/create-account` - Create new teacher/specialist accounts
- `/dashboard/admin/duplicates` - View and manage duplicate teacher records

**Features:**

- Staff statistics (teacher count, specialist count)
- Quick actions for common tasks
- Teacher directory with search, student counts, and account status
- Duplicate detection and cleanup UI
- Account creation with duplicate warning

### 4. Reusable Components

**New Components:**

- `app/components/teachers/teacher-autocomplete.tsx` - Searchable teacher dropdown

**Features:**

- Real-time search as user types (debounced)
- Shows teacher name, classroom, and email
- Option to create new teacher if not found
- Clear selection button
- Handles selected state display

### 5. Navigation & Routing

**Updated Files:**

- `app/components/navigation/navbar.tsx` - Added admin navigation menu
- `middleware.ts` - Added admin role-based routing

**Admin Navigation:**

- Dashboard
- Teachers
- Create Account
- Duplicates

**Routing Logic:**

- Admins accessing non-admin routes → redirect to `/dashboard/admin`
- Non-admins accessing admin routes → redirect to `/dashboard`

## How to Use

### For Administrators

#### Creating a Site Admin Account

```sql
-- 1. Create or update the user's profile with site_admin role
UPDATE profiles
SET role = 'site_admin'
WHERE id = 'user-uuid-here';

-- 2. Grant admin permissions for their school
INSERT INTO admin_permissions (admin_id, role, school_id, district_id, state_id)
VALUES (
  'user-uuid-here',
  'site_admin',
  '062793004795',  -- NCES school ID
  '0627930',       -- NCES district ID
  'ca'             -- State code
);
```

#### Creating Teacher Accounts

1. Log in as site admin
2. Navigate to **Dashboard → Create Account**
3. Select "Teacher" account type
4. Fill in teacher details:
   - First name (required)
   - Last name (required)
   - Email (optional - for future invite feature)
   - Classroom number (optional)
   - Phone number (optional)
5. System will check for duplicates and warn if similar names exist
6. Click "Create Account"

#### Managing Duplicates

1. Navigate to **Dashboard → Duplicates**
2. System scans for teachers with similar names
3. Review each duplicate group
4. Delete duplicate entries (teachers without accounts can be deleted)
5. Keep the most complete/accurate record

#### Viewing Teacher Directory

1. Navigate to **Dashboard → Teachers**
2. Use search bar to filter by name, email, or classroom
3. View student counts for each teacher
4. See account status (active account vs no account)
5. Delete teachers without accounts if needed

### For Resource Specialists

**No Immediate Changes Required:**

- Can continue using existing student forms
- Teachers will now appear in school-wide directory
- Can see teachers created by other specialists at same school
- Future: Student forms will use autocomplete dropdown

## Data Migration

### Existing Teachers

**Current State:**

- Teachers may be duplicated across different resource specialists
- Some teachers only have last names (text entry artifacts)
- Teacher records are tied to the RSP who created them

**Recommended Migration Steps:**

1. **Run Migrations:**

   ```bash
   # Apply both migration files
   supabase migration up
   ```

2. **Create Site Admin Accounts:**
   - Identify one admin per school
   - Update their profile role to 'site_admin'
   - Create admin_permissions records

3. **Clean Up Duplicates:**
   - Site admins use the Duplicates page
   - Manually review and merge duplicate teachers
   - Delete incomplete or duplicate records

4. **Link Teacher Portal Accounts:**
   - For teachers who have portal accounts (role='teacher')
   - Use `linkTeacherToProfile()` to connect profile to teacher record
   - Or manually update teachers.account_id

### Special Activities Migration

The migration automatically attempts to match text-based `teacher_name` values to `teacher_id` records:

- Matches on exact first + last name at same school
- Falls back to last name only if single-word name
- Uses fuzzy matching for close matches
- Logs unmatched activities for manual review

Check migration output for:

- Total activities
- Successfully matched to teacher_id
- Still using text name (need manual review)

## Security & Permissions

### RLS Policies

**Teachers Table:**

- **VIEW**: All staff at same school (specialists, admins, teacher themselves)
- **INSERT**: Resource specialists at same school, Site/District admins
- **UPDATE**: Admins can update all fields, teachers can update own contact info
- **DELETE**: Admins only (cannot delete teachers with active accounts)

**Admin Permissions Table:**

- **VIEW**: Admins can view their own permissions
- **MODIFY**: Only via SQL (super admin feature not yet implemented)

**Special Activities Table:**

- **VIEW**: Resource specialists, teachers at same school
- **MANAGE**: Creator of activity (RSP or teacher)

### Role Hierarchy

```
district_admin  →  Can manage multiple schools in district
       ↓
site_admin      →  Can manage one specific school
       ↓
specialist      →  Can manage their own students & schedule
teacher         →  Can view their students in resource
```

## Known Limitations (MVP)

### Not Yet Implemented

1. **Email Invites:**
   - Teacher accounts are created without login credentials
   - Email invite system not yet built
   - Admin must manually link teacher accounts

2. **Specialist Account Creation:**
   - UI button exists but not functional
   - Must be done via API/SQL for now

3. **CSV Bulk Upload:**
   - No bulk import feature yet
   - Must create teachers one at a time

4. **Student/Activity Form Integration:**
   - Student form still uses text input for teacher names
   - Special activities form still uses text input
   - TODO: Replace with TeacherAutocomplete component

5. **Automated Duplicate Prevention:**
   - Duplicate checking happens on create
   - No real-time validation as user types
   - No automatic merging of duplicates

### Technical Debt

1. **Teacher Account Linking:**
   - No UI for linking existing teacher records to new teacher portal accounts
   - Must be done via SQL or API call

2. **Super Admin Role:**
   - No way to grant/revoke admin permissions via UI
   - Must be done via SQL

3. **District Admin Features:**
   - District admin role exists but features not implemented
   - No cross-school view for district admins

4. **Audit Logging:**
   - No audit trail for teacher record changes
   - No history of account creations/deletions

## Next Steps

### Phase 2: Form Integration

**Priority: High**

- Update student form to use TeacherAutocomplete component
- Update special activities form to use TeacherAutocomplete
- Add "Create New Teacher" inline modal when teacher not found
- Deprecate teacher_name text field in favor of teacher_id

**Implementation:**

```typescript
// In AddStudentForm component:
import { TeacherAutocomplete } from '@/app/components/teachers/teacher-autocomplete';

// Replace text input with:
<TeacherAutocomplete
  value={formData.teacher_id}
  teacherName={formData.teacher_name}
  onChange={(id, name) => {
    setFormData({ ...formData, teacher_id: id, teacher_name: name });
  }}
  onCreateNew={(name) => {
    // Create teacher inline or show modal
  }}
  required
/>
```

### Phase 3: Email Invites

**Priority: Medium**

- Implement admin API endpoint to create auth users
- Build email template for teacher invitations
- Add "Send Invite" button to teacher directory
- Track invite status (sent, opened, activated)

### Phase 4: District Admin

**Priority: Medium**

- Build district-level dashboard
- Add school switcher for district admins
- Implement cross-school teacher directory
- Add district-wide duplicate detection

### Phase 5: Enhancements

**Priority: Low**

- CSV bulk import for teachers
- Automated duplicate detection during data entry
- Audit logging for account changes
- Teacher account self-service (update own info)
- Super admin UI for permission management

## Testing Checklist

### Manual Testing

- [ ] Create site admin account via SQL
- [ ] Grant admin permissions for a school
- [ ] Log in as site admin
- [ ] Create a new teacher account
- [ ] Verify duplicate warning appears for similar names
- [ ] View teacher directory
- [ ] Search for teachers by name
- [ ] Run duplicate scan
- [ ] Delete a duplicate teacher (without account)
- [ ] Verify teacher appears in resource specialist's teacher list
- [ ] Create special activity with teacher dropdown
- [ ] Verify teacher can see their students in resource

### Edge Cases

- [ ] Try to create duplicate teacher (same name, same school)
- [ ] Try to delete teacher with active account (should fail)
- [ ] Try to access admin routes as non-admin (should redirect)
- [ ] Try to access admin routes as teacher (should redirect)
- [ ] Search for teacher with special characters in name
- [ ] Create teacher with only last name
- [ ] Create teacher with long classroom number

## Rollback Plan

If issues arise:

1. **Revert Migrations:**

   ```sql
   -- Drop new tables
   DROP TABLE IF EXISTS admin_permissions;

   -- Revert teachers table
   ALTER TABLE teachers DROP COLUMN IF EXISTS account_id;
   ALTER TABLE teachers DROP COLUMN IF EXISTS created_by_admin;

   -- Revert special_activities table
   ALTER TABLE special_activities DROP COLUMN IF EXISTS teacher_id;

   -- Revert profiles role constraint
   ALTER TABLE profiles DROP CONSTRAINT profiles_role_check;
   ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
   CHECK (role = ANY (ARRAY['resource'::text, 'speech'::text, 'ot'::text,
                             'counseling'::text, 'specialist'::text,
                             'sea'::text, 'teacher'::text]));
   ```

2. **Remove Admin Routes:**
   - Comment out admin navigation in navbar
   - Comment out admin routing in middleware
   - Admin pages will be inaccessible but won't break app

3. **No Data Loss:**
   - Existing teachers remain intact
   - Special activities keep text-based teacher_name
   - No profile data is modified

## Support & Troubleshooting

### Common Issues

**Issue:** Admin can't see teachers created by resource specialists

- **Cause:** Teachers have old provider-scoped RLS policies
- **Fix:** Ensure migrations ran successfully, check RLS policies

**Issue:** Duplicate warning not appearing

- **Cause:** School ID mismatch or query error
- **Fix:** Check that both admin and teachers have correct school_id

**Issue:** Can't delete duplicate teacher

- **Cause:** Teacher has active account (account_id is set)
- **Fix:** Unlink account first or keep the record

**Issue:** Teacher autocomplete not showing results

- **Cause:** School ID not set or no teachers at school
- **Fix:** Verify school_id on profile, create test teacher

### Debug Queries

```sql
-- Check admin permissions
SELECT * FROM admin_permissions WHERE admin_id = 'user-uuid';

-- Check teachers at a school
SELECT * FROM teachers WHERE school_id = 'school-nces-id';

-- Find duplicates manually
SELECT first_name, last_name, COUNT(*)
FROM teachers
WHERE school_id = 'school-nces-id'
GROUP BY first_name, last_name
HAVING COUNT(*) > 1;

-- Check special activities migration status
SELECT
  COUNT(*) as total,
  COUNT(teacher_id) as has_id,
  COUNT(*) FILTER (WHERE teacher_id IS NULL AND teacher_name IS NOT NULL) as text_only
FROM special_activities;
```

## Architecture Decisions

### Why School-Scoped Instead of Provider-Scoped?

**Problem:** Multiple RSPs at same school create duplicate teachers

**Solution:** Teachers belong to the school, not individual providers

**Benefits:**

- Single source of truth for each teacher
- Prevents duplicates across RSPs at same school
- Enables school-wide reporting
- Facilitates teacher portal (one account = one teacher record)

**Tradeoffs:**

- More complex RLS policies
- Requires admin role to manage
- Migration needed for existing data

### Why Manual Duplicate Cleanup?

**Problem:** Automated merging could make mistakes

**Solution:** Admin reviews and manually deletes duplicates

**Benefits:**

- Human oversight prevents data loss
- Admin can choose which record to keep
- No risk of merging wrong teachers

**Tradeoffs:**

- Requires manual effort
- Time-consuming for large schools
- Duplicates may persist if not cleaned up

### Why Admin-Only Account Creation?

**Problem:** Teacher self-registration could create mismatches

**Solution:** Admins create accounts and link to existing records

**Benefits:**

- Ensures data quality
- Prevents duplicate accounts
- Admin can verify teacher identity

**Tradeoffs:**

- Adds admin workload
- Teachers can't self-serve
- Slower onboarding process

## Related Documentation

- [Teacher Portal Plan](./teacher-portal-plan.md)
- Database Schema: `supabase/migrations/`
- RLS Policies: See migration files for policy definitions
- Query Functions: `lib/supabase/queries/admin-accounts.ts`

## Contributors

- Implementation: Claude (Anthropic)
- Requirements: bstewart2255
- Review: Pending

## Version History

- **v1.0.0** (2025-11-12): Initial implementation
  - Site Admin role and dashboard
  - School-level teacher management
  - Duplicate detection and cleanup
  - Teacher autocomplete component
  - Migrations for schema changes
