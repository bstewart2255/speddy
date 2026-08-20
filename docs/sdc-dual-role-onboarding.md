# SDC dual-role onboarding: case manager + own classroom teacher

Some SDC (Special Day Class) staff are **both** the case manager for their
caseload **and** the classroom teacher of record for those same students —
they wear two hats speddy models as two separate rows. Setting them up the
wrong way silently breaks scheduling for their whole class. This is the
repeatable pattern; use it for every dual-role teacher, not just JSUSD's.

## The pattern

1. **Create their login as a specialist, role = Resource Specialist.**
   Admin → *Create Account* → account type **Specialist** → role **Resource
   Specialist** (`app/(dashboard)/dashboard/admin/create-account/page.tsx`,
   `role: 'resource'`). **Never** the **Teacher** account type on that same
   page — that path provisions the stripped-down gen-ed teacher experience
   (no scheduling, no caseload, no lessons), which is the wrong product for
   someone who needs to manage a caseload.

2. **Create a teacher-directory entry for their own classroom.** This is a
   `teachers` table row (first/last name, `classroom_number`, `grade_level`)
   — data, not a second login. Add it the same way any classroom teacher
   entry is added to the school's teacher directory; leave it unlinked to any
   account (`account_id` stays null). The admin's directory edit form is
   `app/components/admin/teacher-edit-modal.tsx`.

3. **Point their caseload to that classroom-teacher entry, then verify it
   became the scheduling teacher.** A student's set of teachers lives on the
   child (`student_teachers`, keyed by `child_id`+`teacher_id` — see
   `docs/ARCHITECTURE.md`'s "Teacher links" section), not a single column, so
   use the student's teacher-link editor (multi-teacher picker) to add the
   resource specialist's own directory entry. **This step is the one most
   likely to silently fail for a student who already has a different teacher
   linked** (e.g. an existing gen-ed teacher on an imported or previously-set-up
   student): the legacy `students.teacher_id`/`teacher_name` mirror only
   repoints itself to the newly-added link when the student's *current* legacy
   teacher is no longer one of their linked teachers — adding a second link
   next to a still-valid one does not move it. Scheduling (the auto-scheduler
   and `lib/scheduling/conflict-resolver.ts`) reads only that legacy pair, not
   the full link set, so a student left pointed at their old teacher will have
   the SDC teacher's special activities invisible to conflict checking — the
   exact silent double-booking this guide exists to prevent. **After adding
   the link, open the student's record and confirm the displayed classroom
   teacher is the SDC teacher's own entry.** If it still shows the old
   teacher, remove that old link first (which frees the mirror to repoint to
   the SDC teacher's link) rather than assuming the add alone was enough. For
   a brand-new student with no prior teacher this isn't an issue — their first
   link becomes the legacy teacher automatically.

4. **Enter the class's special activities under that teacher entry.** PE,
   recess, assemblies, etc. — this is what lets speech/OT/psych schedule
   around the class without double-booking the dual-role teacher's own
   session time.

5. **Name consistency still matters, but there are now two safety nets.**
   Scheduling conflict checks match a student to their class's special
   activities primarily by teacher *name* string
   (`lib/scheduling/conflict-resolver.ts`: `student.teacher_name ===
   newActivity.teacher_name`), but the scheduler's slot-grouping additionally
   indexes special activities under both `teacher_id` **and** `teacher_name`
   so an id match survives name drift (`docs/ARCHITECTURE.md`, "grouping
   modes"). Enter the directory name identically everywhere regardless —
   don't rely on the id fallback covering every path.

## Worked example: JSUSD pilot roster (Aug 2026)

12 case managers are set up this way (specialist login, role = Resource
Specialist, own classroom-teacher directory entry). Everyone else on the
roster — speech, OT, psych, site admin — takes the plain single-role path:
specialist login only, no directory entry, no special activities to enter.

## Why this is worth documenting

Set up the wrong way (teacher account instead of specialist, or no directory
entry at all), a dual-role teacher gets no scheduling/caseload access, or
their own class becomes invisible to every other provider's conflict
checking. Neither failure is loud — it shows up later as sessions silently
double-booked into the SDC classroom's own instruction time.
