'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '../../../components/ui/button';
import { LongHoverTooltip } from '../../../components/ui/long-hover-tooltip';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableActionCell } from '../../../components/ui/table';
import { StudentTag, StatusTag, GradeTag } from '../../../components/ui/tag';
import { getStudents, createStudent, deleteStudent, updateStudent } from '../../../../lib/supabase/queries/students';
import { getUnscheduledSessionsCount } from '../../../../lib/supabase/queries/schedule-sessions';
import { loadStudentsForUser, getUserRole } from '../../../../lib/supabase/queries/sea-students';
import { useSchool } from '../../../components/providers/school-context';
import { createClient } from '@/lib/supabase/client';
import { StudentDetailsModal } from '../../../components/students/student-details-modal';
import { TeacherDetailsModal } from '../../../components/teachers/teacher-details-modal';
import { StudentTeachersField } from '../../../components/teachers/student-teachers-field';
import { TeacherSetCell } from '../../../components/teachers/teacher-set-cell';
import {
  getTeacherSetsForStudents,
  saveTeacherLinksForStudent,
  type EditableTeacherLink,
  type LinkedTeacher,
} from '@/lib/supabase/queries/student-teachers';
import { useRouter } from 'next/navigation';
import { StudentImportModal } from '../../../components/students/student-import-modal';
import { StudentImportReview } from '../../../components/students/review/student-import-review';
import { IepMinutesConverter } from '../../../components/students/iep-minutes-converter';
import { calculateSessions, MAX_MINUTES_PER_SESSION } from '@/lib/services/weekly-minutes';
import { canScheduleAtSecondary } from '@/lib/school-helpers';
import { adaptBulkPreview } from '@/lib/import/review-model';
import type { BulkPreviewData } from '@/lib/types/student-import';

type Student = {
  id: string;
  initials: string;
  grade_level: string;
  teacher_name: string | null;
  teacher_id?: string | null;
  sessions_per_week: number | null;
  minutes_per_session: number | null;
  provider_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  school_site?: string | null;
  school_id?: string | null;
  district_id?: string | null;
  school_district?: string | null;
  // Full name lives in student_details (the identity anchor, SPE-284). PostgREST
  // returns the one-to-one embed as an object, but tolerate an array too.
  student_details?:
    | { first_name: string | null; last_name: string | null }
    | Array<{ first_name: string | null; last_name: string | null }>
    | null;
};

/** The student's full name from the joined details, or null when unnamed. */
function studentFullName(student: Student): string | null {
  const details = Array.isArray(student.student_details)
    ? student.student_details[0]
    : student.student_details;
  const full = `${details?.first_name ?? ''} ${details?.last_name ?? ''}`.trim();
  return full || null;
}

/**
 * Student identity cell for the Students list (SPE-284): the initials tag plus
 * the full name when we have one. Schedule surfaces intentionally show only the
 * initials tag; the full name appears here on the Students page.
 */
function StudentIdentityCell({ student }: { student: Student }) {
  const name = studentFullName(student);
  return (
    <span className="flex items-center gap-2">
      <StudentTag initials={student.initials} />
      {name ? <span className="text-sm font-medium text-gray-900">{name}</span> : null}
    </span>
  );
}

export default function StudentsPage() {
  const [showAddForm, setShowAddForm] = useState(false);
  // SPE-237: the Add Student form stays open for consecutive entries — inline
  // feedback (no alert()) and an initials ref so we can refocus after each add.
  const [addFormError, setAddFormError] = useState<string | null>(null);
  const [addFormConfirmation, setAddFormConfirmation] = useState<string | null>(null);
  const [savingStudent, setSavingStudent] = useState(false);
  const initialsInputRef = useRef<HTMLInputElement>(null);
  // Synchronous guard against a double-submit (Enter pressed twice) before state
  // re-renders; the form is built for rapid keyboard entry.
  const savingStudentRef = useRef(false);
  // Bumped after each add to remount the teacher field — the autocomplete
  // inside keeps its own internal selected-teacher state, so without a fresh
  // mount it would keep showing the teacher from the previous student.
  const [teacherFieldKey, setTeacherFieldKey] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  // SPE-337: a teacher SET. The legacy single pair is still sent to
  // createStudent (the dual-write keeps it and the link set consistent), and
  // it derives from the first entry — which is simply the only entry at
  // elementary, the common case.
  const [teacherLinks, setTeacherLinks] = useState<EditableTeacherLink[]>([]);
  const [formData, setFormData] = useState({
    initials: '',
    grade_level: '',
    sessions_per_week: '',
    minutes_per_session: '30',
    // Secondary-resource (weekly bucket) mode only: the whole weekly amount,
    // saved as sessions_per_week = 1 × this many minutes.
    weekly_minutes: ''
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    sessions_per_week: '',
    minutes_per_session: ''
  });

  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  // SPE-337: the teacher modal is keyed by teacher ID. It used to open on the
  // free-text `students.teacher_name`, which meant a typo opened the wrong
  // record — and with a set of teachers there is no single name to key on.
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null);
  const [teacherSets, setTeacherSets] = useState<Map<string, LinkedTeacher[]>>(new Map());
  const [unscheduledCount, setUnscheduledCount] = useState<number>(0);
  const [sortByGrade, setSortByGrade] = useState(false);
  const [showFileUploadModal, setShowFileUploadModal] = useState(false);
  const [bulkImportPreviewData, setBulkImportPreviewData] = useState<BulkPreviewData | null>(null);
  // Adapt the wire payload into the review model once per preview, not on every
  // render (each render would otherwise rebuild every row/exception).
  const bulkModel = useMemo(
    () => (bulkImportPreviewData ? adaptBulkPreview(bulkImportPreviewData) : null),
    [bulkImportPreviewData],
  );
  const [worksAtMultipleSchools, setWorksAtMultipleSchools] = useState(false);
  const supabase = useMemo(() => createClient(), []);
  const { currentSchool, loading: schoolLoading, isSecondary } = useSchool();
  const router = useRouter();

  // Check if user has view-only access (SEA role)
  // Default to view-only until role is resolved to prevent privilege escalation
  const roleResolved = userRole !== null;
  const isViewOnly = !roleResolved || userRole === 'sea';

  // Secondary-resource caseloads plan service as minutes per week (embedded in
  // class periods), stored as one weekly bucket — 1 "session" × the weekly
  // total — instead of discrete pull-out sessions. Mirrors
  // shouldUseWeeklyBucket(); the school half comes from useSchool().
  const weeklyBucketMode = isSecondary && userRole === 'resource';

  // Check if user works at multiple schools
  useEffect(() => {
    const checkMultipleSchools = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('works_at_multiple_schools')
        .eq('id', user.id)
        .single();

      if (profile) {
        setWorksAtMultipleSchools(profile.works_at_multiple_schools);
      }
    };

    checkMultipleSchools();
  }, [supabase]);

  const checkUnscheduledSessions = useCallback(async () => {
    try {
      if (!currentSchool) {
        setUnscheduledCount(0);
        return;
      }
      const count = await getUnscheduledSessionsCount(currentSchool);
      setUnscheduledCount(count);
    } catch (error) {
      console.error('Error checking unscheduled sessions:', error);
      setUnscheduledCount(0);
    }
  }, [currentSchool]);

  const fetchStudents = useCallback(async () => {
    try {
      if (!currentSchool) {
        setStudents([]);
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('No user found');
        setStudents([]);
        setLoading(false);
        return;
      }

      // Get user role if not already set
      let currentRole = userRole;
      if (!currentRole) {
        const role = await getUserRole(user.id);
        setUserRole(role);
        currentRole = role; // Use the fresh role immediately
      }

      // Use role-aware query for SEAs, standard query for others
      if (currentRole === 'sea') {
        const { data, error } = await loadStudentsForUser(user.id, currentRole, {
          currentSchool
        });

        if (error) {
          console.error('Error fetching SEA students:', {
            errorMessage: error?.message,
            errorCode: error?.code,
            errorDetails: error?.details,
            errorHint: error?.hint
          });
          setStudents([]);
        } else if (!Array.isArray(data)) {
          console.error('SEA students data is not an array');
          setStudents([]);
        } else {
          setStudents(data as Student[]);
        }
      } else {
        const data = await getStudents(currentSchool);

        if (!Array.isArray(data)) {
          console.error('Students data is not an array');
          setStudents([]);
        } else {
          setStudents(data);
        }
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  }, [currentSchool, userRole, supabase]);

  // Fetch students
  useEffect(() => {
    fetchStudents();
    checkUnscheduledSessions();
  }, [currentSchool, fetchStudents, checkUnscheduledSessions]);

  // SPE-337: each student's teacher SET, for the roster column. Loaded after
  // the students rather than folded into getStudents(), so the query's
  // contract — shared with several other callers — stays as it is.
  useEffect(() => {
    let cancelled = false;
    if (students.length === 0) {
      setTeacherSets(new Map());
      return;
    }
    getTeacherSetsForStudents(supabase, students.map(s => s.id))
      .then(sets => { if (!cancelled) setTeacherSets(sets); })
      .catch(err => console.error('Error fetching teacher sets:', err));
    return () => { cancelled = true; };
  }, [students, supabase]);

  // Focus Initials when the form opens so entry starts at the keyboard.
  useEffect(() => {
    if (showAddForm) initialsInputRef.current?.focus();
  }, [showAddForm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingStudentRef.current) return; // already submitting — ignore the repeat
    setAddFormError(null);
    setAddFormConfirmation(null);

    if (!currentSchool) {
      setAddFormError('No school selected.');
      return;
    }

    const addedInitials = formData.initials;
    savingStudentRef.current = true;
    setSavingStudent(true);
    try {
      const created = await createStudent({
        initials: formData.initials,
        grade_level: formData.grade_level,
        teacher_id: teacherLinks[0]?.teacherId ?? null,
        teacher_name: teacherLinks[0]?.name || undefined,
        sessions_per_week: weeklyBucketMode ? 1 : parseInt(formData.sessions_per_week),
        minutes_per_session: weeklyBucketMode
          ? parseInt(formData.weekly_minutes)
          : parseInt(formData.minutes_per_session),
        school_site: currentSchool?.school_site || '',
        school_district: currentSchool?.school_district || '',
        school_id: currentSchool?.school_id,
        district_id: currentSchool?.district_id,
        state_id: currentSchool?.state_id,
      });

      // The first teacher arrived via the legacy column (and the SPE-334
      // trigger mirrored it into a bare link); everything the mirror cannot
      // carry — co-teachers, and the subject/period labels on ANY link — is
      // written here, once the student and its child record exist. Running
      // this for a single teacher too is what keeps a secondary student's
      // labels from being silently dropped whenever they have exactly one.
      //
      // This is a second round trip, so it can fail on its own. The student is
      // already created at this point: reporting the whole add as failed would
      // send the user to retry an entry that now trips the uniqueness
      // constraint. Treat the add as succeeded and name what is missing.
      let coTeachersFailed = false;
      if (created && teacherLinks.length > 0) {
        try {
          await saveTeacherLinksForStudent(supabase, created.id, teacherLinks);
        } catch (linkError) {
          console.error('Error saving co-teacher links:', linkError);
          coTeachersFailed = true;
        }
      }

      // SPE-237: stay open for the next entry. Reset the per-student fields but
      // keep the grade preselected (caseloads cluster by grade), confirm inline,
      // and refocus Initials so the next student can be typed without the mouse.
      setFormData({
        initials: '',
        grade_level: formData.grade_level,
        sessions_per_week: '',
        minutes_per_session: '30',
        weekly_minutes: ''
      });
      setTeacherLinks([]);
      setTeacherFieldKey((k) => k + 1);
      if (coTeachersFailed) {
        setAddFormError(
          `${addedInitials} was added, but the teacher details could not be saved. ` +
          `Open the student to set them again.`,
        );
      } else {
        setAddFormConfirmation(`${addedInitials} added`);
      }
      fetchStudents();
      checkUnscheduledSessions();
      initialsInputRef.current?.focus();
    } catch (error) {
      console.error('Error creating student:', error);
      // Inline error — keep the form open and the other fields intact so the
      // user can correct (e.g. duplicate initials) without re-entering everything.
      setAddFormError(error instanceof Error ? error.message : 'Failed to add student');
      initialsInputRef.current?.focus();
    } finally {
      savingStudentRef.current = false;
      setSavingStudent(false);
    }
  };

  // Finish adding — closes the form and clears its inline state (the header × and
  // the Done button both route here).
  const handleCloseAddForm = () => {
    setShowAddForm(false);
    setAddFormError(null);
    setAddFormConfirmation(null);
    setTeacherLinks([]);
    setFormData({
      initials: '',
      grade_level: '',
      sessions_per_week: '',
      minutes_per_session: '30',
      weekly_minutes: ''
    });
  };

  const handleDelete = async (studentId: string, studentInitials: string) => {
    if (confirm(`Are you sure you want to delete ${studentInitials}? This will also delete all their scheduled sessions.`)) {
      try {
        await deleteStudent(studentId);
        fetchStudents();
        checkUnscheduledSessions();
      } catch (error) {
        console.error('Error deleting student:', error);
        alert('Failed to delete student. Please try again.');
      }
    }
  };

  const handleEdit = (student: Student) => {
    setEditingId(student.id);
    if (weeklyBucketMode) {
      // Edit the weekly total. Saving normalizes to the bucket shape (1 × N) —
      // including a student imported before the bucket rule as e.g. 19 × 30,
      // whose product is the same weekly amount.
      const weekly = (student.sessions_per_week || 0) * (student.minutes_per_session || 0);
      setEditFormData({
        sessions_per_week: '1',
        minutes_per_session: weekly ? weekly.toString() : ''
      });
      return;
    }
    setEditFormData({
      sessions_per_week: student.sessions_per_week?.toString() || '',
      minutes_per_session: student.minutes_per_session?.toString() || ''
    });
  };

  const handleUpdate = async (studentId: string) => {
    try {
      await updateStudent(studentId, {
        sessions_per_week: weeklyBucketMode ? 1 : parseInt(editFormData.sessions_per_week),
        minutes_per_session: parseInt(editFormData.minutes_per_session)
      });

      setEditingId(null);
      fetchStudents();
      checkUnscheduledSessions();
    } catch (error) {
      console.error('Error updating student:', error);
      alert('Failed to update student. Please try again.');
    }
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditFormData({
      sessions_per_week: '',
      minutes_per_session: ''
    });
  };

  // Calculate total sessions and minutes across all students
  const totals = useMemo(() => {
    return students.reduce((acc, student) => {
      const sessions = student.sessions_per_week || 0;
      const minutes = student.minutes_per_session || 0;

      return {
        totalSessions: acc.totalSessions + sessions,
        totalMinutes: acc.totalMinutes + (sessions * minutes)
      };
    }, { totalSessions: 0, totalMinutes: 0 });
  }, [students]);

  if (loading || schoolLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p>Loading students...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Page Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Students</h1>
            <p className="text-gray-600">{isViewOnly ? 'View your assigned students' : 'Manage your student caseload'}</p>
          </div>
          {!isViewOnly && (
            <div className="flex items-center gap-3">
              <LongHoverTooltip content="Import students from your SEIS and Aeries files. Drop everything at once — goals report, deliveries, and class list — and we detect each one.">
                <Button
                  variant="secondary"
                  onClick={() => setShowFileUploadModal(true)}
                >
                  Import Students
                </Button>
              </LongHoverTooltip>
              <LongHoverTooltip content="Add a new student to your caseload. You'll need their name, grade, teacher, and service requirements.">
                <Button
                  variant="primary"
                  onClick={() => setShowAddForm(true)}
                >
                  + Add Student
                </Button>
              </LongHoverTooltip>
            </div>
          )}
        </div>

        {/* Unified Import Students Modal */}
        <StudentImportModal
          isOpen={showFileUploadModal}
          onClose={() => setShowFileUploadModal(false)}
          onUploadComplete={(data) => {
            setShowFileUploadModal(false);
            setBulkImportPreviewData(data);
          }}
          currentSchool={currentSchool}
        />

        {/* Import review screen (SPE-227) */}
        {bulkModel && (
          <StudentImportReview
            isOpen={!!bulkModel}
            onClose={() => setBulkImportPreviewData(null)}
            model={bulkModel}
            schoolId={currentSchool?.school_id || undefined}
            onComplete={() => {
              // Refresh the caseload behind the modal without unmounting it, so a
              // partial-failure modal stays open on its error list. Imported students
              // can carry a schedule, so refresh the unscheduled-sessions banner too
              // (every other mutation handler on this page refreshes both).
              fetchStudents();
              checkUnscheduledSessions();
            }}
            onConfirm={async ({ rows }) => {
              const students = rows.map(({ row, initials, selectedGoalTexts, confirmedChildId }) => ({
                firstName: row.firstName,
                lastName: row.lastName,
                initials,
                gradeLevel: row.gradeLevel,
                goals: selectedGoalTexts,
                action: row.action,
                studentId: row.targetStudentId,
                schoolId: currentSchool?.school_id,
                schoolSite: currentSchool?.school_site,
                districtId: currentSchool?.district_id,
                stateId: currentSchool?.state_id,
                sessionsPerWeek: row.schedule?.sessionsPerWeek,
                minutesPerSession: row.schedule?.minutesPerSession,
                teacherId: row.teacher?.teacherId || undefined,
                teacherName: row.teacher?.teacherName || undefined,
                // IEP Dates (SPE-303): presence-keyed — send a date only when the
                // IEP Dates file supplied one, so the confirm write overwrites on
                // presence (file wins) and leaves it untouched on absence.
                upcomingIepDate: row.iepDates?.upcomingIepDate?.value,
                upcomingTriennialDate: row.iepDates?.upcomingTriennialDate?.value,
                // District Student ID (SPE-339): presence-keyed too. Undefined
                // when the file carried none, or when the id was disputed — the
                // preview drops a conflicting id rather than re-pointing it.
                districtStudentId: row.districtStudentId,
                // Create-or-attach (SPE-348): present only when the importer
                // answered "same child" on an offer the preview made. The server
                // re-validates it, so this is a claim rather than an instruction.
                confirmedChildId,
              }));

              const response = await fetch('/api/import-students/confirm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ students }),
              });
              const result = await response.json();
              if (!response.ok) {
                throw new Error(result.error || 'Failed to import students');
              }

              // The confirm route returns input-ordered results; map back by index.
              const results: Array<{ success: boolean; error?: string }> = result.data.results;
              const outcomes = rows.map((r, i) => ({
                rowId: r.row.id,
                success: results[i]?.success ?? false,
                error: results[i]?.error,
              }));
              return {
                outcomes,
                succeeded: outcomes.filter((o) => o.success).length,
                failed: outcomes.filter((o) => !o.success).length,
              };
            }}
          />
        )}

        {/* Unscheduled Sessions Notification — scheduling doesn't apply on
            secondary sites, except for related-service roles (SPE-490) */}
        {(!isSecondary || canScheduleAtSecondary(userRole)) && unscheduledCount > 0 && (
          <div className="mb-8 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-amber-400 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-amber-800">
                  {unscheduledCount} session{unscheduledCount !== 1 ? 's' : ''} need{unscheduledCount === 1 ? 's' : ''} to be scheduled
                </p>
                <p className="text-sm text-amber-700">
                  Go to the <a href="/dashboard/schedule" className="underline font-medium">Schedule page</a> and click &quot;Schedule Sessions&quot; to add these to your calendar
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Add Student Form (Inline) */}
        {!isViewOnly && showAddForm && (
          <div className="mb-8">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center gap-4">
                  <CardTitle>Add New Student</CardTitle>
                  <Button
                    variant="secondary"
                    onClick={handleCloseAddForm}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </Button>
                </div>
              </CardHeader>
              <CardBody>
                {addFormError && (
                  <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                    {addFormError}
                  </div>
                )}
                  <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Student Initials*
                    </label>
                    <input
                      type="text"
                      ref={initialsInputRef}
                      required
                      value={formData.initials}
                      onChange={(e) => {
                        setFormData({...formData, initials: e.target.value});
                        if (addFormConfirmation) setAddFormConfirmation(null);
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., JD"
                    />
                  </div>

                  <div className="md:col-span-1">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Grade Level*
                    </label>
                    <select
                      required
                      value={formData.grade_level}
                      onChange={(e) => setFormData({...formData, grade_level: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Select grade</option>
                      <option value="TK">TK</option>
                      <option value="K">K</option>
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                      <option value="5">5</option>
                      <option value="6">6</option>
                      <option value="7">7</option>
                      <option value="8">8</option>
                      <option value="9">9</option>
                      <option value="10">10</option>
                      <option value="11">11</option>
                      <option value="12">12</option>
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {isSecondary ? 'Teachers*' : 'Teacher*'}
                    </label>
                    <StudentTeachersField
                      key={teacherFieldKey}
                      value={teacherLinks}
                      onChange={setTeacherLinks}
                      isSecondary={isSecondary}
                      required
                      schoolId={currentSchool?.school_id || undefined}
                    />
                  </div>

                  {weeklyBucketMode ? (
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Minutes/Week*
                      </label>
                      <input
                        type="number"
                        required
                        min="1"
                        max={MAX_MINUTES_PER_SESSION}
                        value={formData.weekly_minutes}
                        onChange={(e) => setFormData({...formData, weekly_minutes: e.target.value})}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="e.g. 570"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Sessions/Week*
                        </label>
                        <input
                          type="number"
                          required
                          min="1"
                          max="20"
                          value={formData.sessions_per_week}
                          onChange={(e) => setFormData({...formData, sessions_per_week: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="2"
                        />
                      </div>

                      <div className="md:col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Min/Session*
                        </label>
                        <select
                          required
                          value={formData.minutes_per_session}
                          onChange={(e) => setFormData({...formData, minutes_per_session: e.target.value})}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          {/* The IEP converter can suggest a non-standard length
                              (e.g. a 23-min/week mandate); keep the exact value
                              selectable rather than forcing a rounding. */}
                          {formData.minutes_per_session &&
                            !['30', '45', '60'].includes(formData.minutes_per_session) && (
                              <option value={formData.minutes_per_session}>
                                {formData.minutes_per_session}
                              </option>
                            )}
                          <option value="30">30</option>
                          <option value="45">45</option>
                          <option value="60">60</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="md:col-span-6">
                    <IepMinutesConverter
                      onApply={(weekly) => {
                        if (weeklyBucketMode) {
                          setFormData((f) => ({ ...f, weekly_minutes: weekly.toString() }));
                          return;
                        }
                        // Elementary: apply the standard session split as an
                        // editable suggestion.
                        const split = calculateSessions(weekly);
                        setFormData((f) => ({
                          ...f,
                          sessions_per_week: split.sessionsPerWeek.toString(),
                          minutes_per_session: split.minutesPerSession.toString(),
                        }));
                      }}
                    />
                  </div>

                  <div className="md:col-span-6 flex items-center justify-end gap-3 pt-4">
                    {addFormConfirmation && (
                      <span className="mr-auto text-sm font-medium text-green-700">
                        {addFormConfirmation}
                      </span>
                    )}
                    <Button variant="secondary" type="button" onClick={handleCloseAddForm}>
                      Done
                    </Button>
                    <Button variant="primary" type="submit" disabled={savingStudent}>
                      {savingStudent ? 'Adding…' : 'Add & add another'}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          </div>
        )}

        {/* Student Details Modal */}
        {selectedStudent && (
          <StudentDetailsModal
            isOpen={!!selectedStudent}
            onClose={() => setSelectedStudent(null)}
            student={{
              ...selectedStudent,
              teacher_name: selectedStudent.teacher_name || '',
              sessions_per_week: selectedStudent.sessions_per_week || 0,
              minutes_per_session: selectedStudent.minutes_per_session || 0
            }}
            readOnly={isViewOnly}
            providerRole={userRole}
            onSave={(studentId, details) => {
            }}
            onUpdateStudent={async (studentId, updates) => {
              try {
                await updateStudent(studentId, updates);
                // Refresh the students list
                await fetchStudents();
                alert('Student information updated successfully!');
              } catch (error) {
                console.error('Error updating student:', error);
                alert('Failed to update student information.');
              }
            }}
          />
        )}

        {/* Teacher Details Modal */}
        {selectedTeacherId && (
          <TeacherDetailsModal
            isOpen={!!selectedTeacherId}
            onClose={() => setSelectedTeacherId(null)}
            teacherId={selectedTeacherId}
            onSave={async (teacher) => {
              // Refresh students list to show updated teacher name if changed
              await fetchStudents();
            }}
            onStudentClick={(student) => {
              // Find the full student object from our list
              const fullStudent = students.find(s => s.id === student.id);
              if (fullStudent) {
                setSelectedStudent(fullStudent);
              }
            }}
          />
        )}
        
        {/* Students List */}
        <Card>
          <CardHeader
            action={
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sortByGrade}
                  onChange={(e) => setSortByGrade(e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
                <span className="text-sm font-medium text-gray-700">Sort by Grade</span>
              </label>
            }
          >
            <CardTitle>Current Students ({students.length})</CardTitle>
          </CardHeader>
          <CardBody>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Schedule Requirements</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Array.isArray(students) ? [...students] : [])
                  .sort((a, b) => {
                    if (!sortByGrade) return 0;

                    // Define grade order (TK comes first, then K, then 1-12)
                    const gradeOrder = ['TK', 'K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'];
                    const aIndex = gradeOrder.indexOf(a.grade_level);
                    const bIndex = gradeOrder.indexOf(b.grade_level);

                    // If grade not found in order, put it at the end
                    if (aIndex === -1) return 1;
                    if (bIndex === -1) return -1;

                    return aIndex - bIndex;
                  })
                  .map((student) => (
                  <TableRow key={student.id}>
                    <TableCell>
                      <button
                        onClick={() => setSelectedStudent(student)}
                        className="hover:opacity-80 transition-opacity"
                      >
                        <StudentIdentityCell student={student} />
                      </button>
                    </TableCell>
                    <TableCell>
                      <GradeTag grade={student.grade_level} />
                    </TableCell>
                    <TableCell>
                      <TeacherSetCell
                        teachers={teacherSets.get(student.id) ?? []}
                        fallbackName={student.teacher_name}
                        isSecondary={isSecondary}
                        onOpenTeacher={setSelectedTeacherId}
                      />
                    </TableCell>
                    <TableCell>
                      {!isViewOnly && editingId === student.id ? (
                        weeklyBucketMode ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="number"
                              min="1"
                              max={MAX_MINUTES_PER_SESSION}
                              value={editFormData.minutes_per_session}
                              onChange={(e) => setEditFormData({...editFormData, minutes_per_session: e.target.value})}
                              className="w-24 px-2 py-1 border border-gray-300 rounded"
                            />
                            <span>min/week</span>
                          </div>
                        ) : (
                        <div className="flex gap-2 items-center">
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={editFormData.sessions_per_week}
                            onChange={(e) => setEditFormData({...editFormData, sessions_per_week: e.target.value})}
                            className="w-16 px-2 py-1 border border-gray-300 rounded"
                          />
                          <span>x/week,</span>
                          <select
                            value={editFormData.minutes_per_session}
                            onChange={(e) => setEditFormData({...editFormData, minutes_per_session: e.target.value})}
                            className="w-20 px-2 py-1 border border-gray-300 rounded"
                          >
                            <option value="30">30</option>
                            <option value="45">45</option>
                            <option value="60">60</option>
                          </select>
                          <span>min</span>
                        </div>
                        )
                      ) : student.sessions_per_week && student.minutes_per_session ? (
                        // Bucket mode reads as a weekly total. The product is
                        // identical for bucket-shaped rows (1 × N) and heals the
                        // display of legacy chopped rows (19 × 30 → 570 min/week).
                        weeklyBucketMode
                          ? `${(student.sessions_per_week * student.minutes_per_session).toLocaleString()} min/week`
                          : `${student.sessions_per_week}x/week, ${student.minutes_per_session} min`
                      ) : (
                        <span className="text-gray-400 italic">Not configured</span>
                      )}
                    </TableCell>
                    <TableActionCell>
                      {!isViewOnly && (
                        <>
                          {editingId === student.id ? (
                            <>
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={() => handleUpdate(student.id)}
                              >
                                Save
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={handleCancelEdit}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <LongHoverTooltip content={weeklyBucketMode
                                ? "Edit this student's total service minutes per week."
                                : "Edit this student's service minutes — sessions per week and minutes per session."}>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleEdit(student)}
                                >
                                  Edit
                                </Button>
                              </LongHoverTooltip>
                              <LongHoverTooltip content="Permanently remove this student from your caseload. This action cannot be undone and will delete all associated sessions.">
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => handleDelete(student.id, student.initials)}
                                >
                                  Delete
                                </Button>
                              </LongHoverTooltip>
                            </>
                          )}
                        </>
                      )}
                    </TableActionCell>
                  </TableRow>
                ))}

                {/* Total Summary Row */}
                {!isViewOnly && students.length > 0 && (
                  <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                    <td colSpan={3} className="px-4 py-3 text-right text-gray-900">
                      Total Caseload:
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {weeklyBucketMode
                        ? `${totals.totalMinutes.toLocaleString()} min/week`
                        : `${totals.totalSessions} sessions/week, ${totals.totalMinutes.toLocaleString()} min/week`}
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                )}
              </TableBody>
            </Table>
          </CardBody>
        </Card>

      </div>
    </div>
  );
}