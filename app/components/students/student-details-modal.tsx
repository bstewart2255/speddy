'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input, Label, FormGroup } from '../ui/form';
import { getStudentDetails, upsertStudentDetails, StudentDetails, getMatchingProviderRoles } from '../../../lib/supabase/queries/student-details';
import { adaptTargetStudentPreview } from '@/lib/import/review-model';
import type { TargetPreviewData } from '@/lib/types/student-import';
import AssessmentList from './assessment-list';
import { IEPGoalsUploader } from './iep-goals-uploader';
import { AccommodationsPdfImport } from './accommodations-pdf-import';
import {
  StudentImportReview,
  type ReviewConfirmSelection,
  type ReviewWriteResult,
} from './review/student-import-review';
import { StudentTeachersField } from '../teachers/student-teachers-field';
import {
  getTeacherLinksForStudent,
  saveTeacherLinksForStudent,
  type EditableTeacherLink,
} from '@/lib/supabase/queries/student-teachers';
import { createClient } from '@/lib/supabase/client';
import { StudentProgressTab } from './student-progress-tab';
import { StudentAttendanceTab } from './student-attendance-tab';
import { SharedStudentBadge } from './shared-student-badge';
import { getIepDateWarning } from '@/lib/utils/iep-date-utils';
import { useSchool } from '../providers/school-context';
import { TeamChatButton } from '../chat/team-chat-button';
import { IepMinutesConverter } from './iep-minutes-converter';
import { MAX_MINUTES_PER_SESSION } from '@/lib/services/weekly-minutes';
import { canScheduleAtSecondary } from '@/lib/school-helpers';

interface StudentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    initials: string;
    grade_level: string;
    teacher_id?: string | null;
    teacher_name?: string | null;
    sessions_per_week: number;
    minutes_per_session: number;
    school_id?: string | null;
  };
  readOnly?: boolean;
  /**
   * The signed-in provider's role (profiles.role). With a secondary school
   * active, a 'resource' provider edits service minutes as one weekly bucket
   * (service is embedded in class periods, not pull-out sessions); other
   * roles keep the fields hidden on secondary as before.
   */
  providerRole?: string | null;
  onSave?: (studentId: string, details: StudentDetails) => void;
  /**
   * SPE-337: no teacher fields here. The teacher set is written directly to
   * `student_teachers`, and the legacy `students.teacher_id`/`teacher_name`
   * pair is maintained by the SPE-334 mirror — not by this form.
   */
  onUpdateStudent?: (studentId: string, updates: {
    initials?: string;
    grade_level: string;
    sessions_per_week: number;
    minutes_per_session: number;
  }) => void;
}

export function StudentDetailsModal({
  isOpen,
  onClose,
  student,
  readOnly = false,
  providerRole,
  onSave,
  onUpdateStudent
}: StudentDetailsModalProps) {
  const [details, setDetails] = useState<StudentDetails>({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    district_student_id: '',
    upcoming_iep_date: '',
    upcoming_triennial_date: '',
    iep_goals: [],
    accommodations: [],
    goals_iep_date: undefined
  });
  const [loading, setLoading] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importData, setImportData] = useState<TargetPreviewData | null>(null);
  const [activeTab, setActiveTab] = useState<'current' | 'iep' | 'assessments' | 'progress' | 'attendance' | 'accommodations'>('current');
  const [matchingRoles, setMatchingRoles] = useState<string[]>([]);

  // On secondary (middle/high) sites the elementary scheduling surfaces are
  // hidden: the "Current Information" (service-minutes) and Attendance tabs.
  // This is purely subtractive — the underlying data is untouched.
  const { isSecondary } = useSchool();
  const supabase = useMemo(() => createClient(), []);

  // SPE-337: the student's teacher SET, loaded from student_teachers and
  // written back on save. The legacy single pair is NOT written from here —
  // the SPE-334 mirror owns that column and repoints it only when the row's
  // current teacher has actually left the set.
  const [teacherLinks, setTeacherLinks] = useState<EditableTeacherLink[]>([]);
  // Until the set has actually loaded, `teacherLinks` is [] — which as a
  // *requested* set means "remove every teacher". Saving during that window
  // would delete the student's real links, so Save waits for the load.
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [linksLoadFailed, setLinksLoadFailed] = useState(false);
  // What the set looked like on open. A student's teachers are anchored on the
  // CHILD, so a co-provider can add one while this modal sits open; writing an
  // untouched snapshot back would delete their addition. Compare before
  // writing, and a user who never touched the teacher field never disturbs it.
  const [loadedLinks, setLoadedLinks] = useState<EditableTeacherLink[]>([]);

  const [studentInfo, setStudentInfo] = useState({
    initials: student.initials,
    grade_level: student.grade_level,
    sessions_per_week: student.sessions_per_week,
    minutes_per_session: student.minutes_per_session,
  });

  // Reset form when modal opens with a different student
  useEffect(() => {
    let stale = false;

    if (isOpen && student.id) {
      // Reset student info to current values
      setStudentInfo({
        initials: student.initials,
        grade_level: student.grade_level,
        sessions_per_week: student.sessions_per_week,
        minutes_per_session: student.minutes_per_session,
      });
      // Clear the previous student's set immediately — showing their teachers
      // under this student's name for the length of a fetch is worse than
      // showing none, and saving it would apply them to the wrong child.
      setTeacherLinks([]);
      setLoadedLinks([]);
      setLinksLoaded(false);
      setLinksLoadFailed(false);

      // Load existing student details and matching provider roles
      const loadData = async () => {
        try {
          // Load student details, matching provider roles and the teacher set
          // in parallel.
          const [existingDetails, roles, links] = await Promise.all([
            getStudentDetails(student.id),
            getMatchingProviderRoles(student.id),
            getTeacherLinksForStudent(supabase, student.id),
          ]);
          // A slower earlier request must not overwrite a newer student's data.
          if (stale) return;
          setTeacherLinks(links);
          setLoadedLinks(links);
          setLinksLoaded(true);

          if (existingDetails) {
            setDetails(existingDetails);
          } else {
            // Reset to empty if no details exist
            setDetails({
              first_name: '',
              last_name: '',
              date_of_birth: '',
              district_student_id: '',
              upcoming_iep_date: '',
              upcoming_triennial_date: '',
              iep_goals: [],
              accommodations: [],
              goals_iep_date: undefined
            });
          }

          setMatchingRoles(roles);
        } catch (error) {
          if (stale) return;
          console.error('Error loading student data:', error);
          // Save stays disabled without this — the user would face a dead
          // button and no reason for it.
          setLinksLoadFailed(true);
        }
      };

      loadData();
    }

    return () => { stale = true; };
  }, [isOpen, supabase, student.id, student.initials, student.grade_level, student.sessions_per_week, student.minutes_per_session]);

  // Secondary mode hides only the Attendance tab; if it's active, snap to a
  // visible tab. Current Information stays visible so grade/teacher/IEP dates
  // remain editable — just the service-minutes fields within it are hidden.
  useEffect(() => {
    if (isSecondary && activeTab === 'attendance') {
      setActiveTab('iep');
    }
  }, [isSecondary, activeTab]);

  // Set equality, not array equality: order carries no meaning (co-teachers
  // are equals), so only membership and the labels count as an edit.
  const teacherLinksChanged = (() => {
    if (teacherLinks.length !== loadedLinks.length) return true;
    const before = new Map(loadedLinks.map(l => [l.teacherId, l]));
    return teacherLinks.some(l => {
      const prev = before.get(l.teacherId);
      return !prev || prev.subject !== l.subject || prev.period !== l.period;
    });
  })();

  const handleSave = async () => {
    // The set is the source of truth for what gets written; an unloaded [] is
    // not an instruction to unassign everyone.
    if (!linksLoaded) return;
    // The weekly-minutes input's min/max don't gate a button-driven save, and
    // a cleared field is stored as 0 — validate before any write so a bad
    // value can't half-save the modal and close it (the students-page caller
    // swallows the DB rejection).
    if (
      isSecondary &&
      providerRole?.trim() === 'resource' &&
      !readOnly &&
      studentInfo.sessions_per_week === 1 &&
      (studentInfo.minutes_per_session < 1 ||
        studentInfo.minutes_per_session > MAX_MINUTES_PER_SESSION)
    ) {
      alert(
        `Service Minutes per Week must be between 1 and ${MAX_MINUTES_PER_SESSION.toLocaleString()}.`
      );
      return;
    }
    setLoading(true);
    try {
      // Save student details
      await upsertStudentDetails(student.id, details);
      console.log('Student details saved successfully');

      // SPE-337: the link set is the whole teacher edit. The legacy
      // students.teacher_id/teacher_name pair is NOT written from here — the
      // SPE-334 mirror maintains it, repointing a caseload row only when that
      // row's current teacher has genuinely left the child's set.
      //
      // Deriving it from teacherLinks[0] instead would read meaning into the
      // row order that the editor deliberately does not carry: removing and
      // re-adding a co-teacher reorders the array without changing the set,
      // and the mirror would then read the new first entry as a replacement
      // and revoke the other teacher's access.
      //
      // Only written when actually edited: the set belongs to the child, so a
      // co-provider may have changed it since this modal opened, and someone
      // saving an IEP date should not silently undo that.
      //
      // The details above are already committed by the time this runs, so a
      // throw here must not abandon the rest of the save — the grade and
      // service minutes would be dropped for a reason that has nothing to do
      // with them. Report just the part that failed.
      let teacherSaveError: Error | null = null;
      if (teacherLinksChanged) {
        try {
          await saveTeacherLinksForStudent(supabase, student.id, teacherLinks);
        } catch (err) {
          console.error('Error saving teacher links:', err);
          teacherSaveError = err instanceof Error ? err : new Error(String(err));
        }
      }

      // Update student info if changed. Passed as a literal on purpose: that
      // is what makes excess-property checking apply, so re-adding a teacher
      // field here is a compile error rather than a silent regression.
      if (onUpdateStudent) {
        await onUpdateStudent(student.id, {
          initials: studentInfo.initials,
          grade_level: studentInfo.grade_level,
          sessions_per_week: studentInfo.sessions_per_week,
          minutes_per_session: studentInfo.minutes_per_session,
        });
        console.log('Student info updated successfully');
      }

      if (onSave) {
        onSave(student.id, details);
      }

      if (teacherSaveError) {
        // Stay open on the teachers the user asked for, so a retry is one
        // click rather than re-entering the whole set.
        alert(`Everything else was saved, but the teachers were not: ${teacherSaveError.message}`);
        return;
      }
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      if (error instanceof Error) {
        console.error('Full error details:', {
          message: error.message,
          stack: error.stack,
          details: (error as unknown as Record<string, unknown>).details,
          hint: (error as unknown as Record<string, unknown>).hint
        });
      }
      // Show what actually went wrong (e.g. a duplicate District Student ID) —
      // a generic message leaves the user retrying the same failing value.
      alert(error instanceof Error ? error.message : 'Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadComplete = (data: TargetPreviewData) => {
    setImportData(data);
    setShowImportPreview(true);
  };

  const handleImportComplete = async () => {
    // Refresh the details behind the review WITHOUT closing it, so a partial
    // failure keeps the review open on its error list (mirrors the bulk caller).
    // Closing is owned by onClose — full success, or the Done button.
    try {
      const existingDetails = await getStudentDetails(student.id);
      if (existingDetails) {
        setDetails(existingDetails);
      }
    } catch (error) {
      console.error('Error reloading student details:', error);
    }
  };

  // Per-student IEP goals import (SPE-234): the write runs server-side at
  // /api/import-iep-goals/confirm (provider-scoped, RLS-backstopped), which
  // merges the selected goals into each student — nothing is removed. A selected
  // row with no goals is a no-op (skipped, not sent).
  const handleTargetImport = async ({ rows }: ReviewConfirmSelection): Promise<ReviewWriteResult> => {
    const entries = rows
      .filter(({ row, selectedGoalTexts }) => row.targetStudentId && selectedGoalTexts.length > 0)
      .map(({ row, selectedGoalTexts }) => ({
        rowId: row.id,
        studentId: row.targetStudentId as string,
        goals: selectedGoalTexts,
        iepDate: row.iepDate,
      }));

    if (entries.length === 0) {
      return { outcomes: [], succeeded: 0, failed: 0 };
    }

    try {
      const response = await fetch('/api/import-iep-goals/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          students: entries.map(({ studentId, goals, iepDate }) => ({ studentId, goals, iepDate })),
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save goals');
      }

      // The route returns input-ordered results; map each back to its row.
      const serverResults: Array<{ success: boolean; error?: string }> = result.data?.results ?? [];
      const outcomes = entries.map((entry, i) => ({
        rowId: entry.rowId,
        success: serverResults[i]?.success ?? false,
        error: serverResults[i]?.error,
      }));
      return {
        outcomes,
        succeeded: outcomes.filter(o => o.success).length,
        failed: outcomes.filter(o => !o.success).length,
      };
    } catch (err) {
      // Whole-request failure (network / non-OK) — every submitted row failed.
      const message = err instanceof Error ? err.message : 'Failed to save goals';
      const outcomes = entries.map(entry => ({ rowId: entry.rowId, success: false, error: message }));
      return { outcomes, succeeded: 0, failed: outcomes.length };
    }
  };

  // Adapt the per-student IEP preview into the shared review model once per upload.
  const reviewModel = useMemo(
    () => (importData ? adaptTargetStudentPreview(importData) : null),
    [importData],
  );

  if (!isOpen) return null;

  return (
    <>
    <div className={`fixed inset-0 z-50 overflow-y-auto ${showImportPreview ? 'hidden' : ''}`}>
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-semibold text-gray-900">
                {/* SPE-284: lead with the full name (identity anchor) once loaded;
                    fall back to initials for unnamed students. */}
                Student Details:{' '}
                {[details.first_name, details.last_name]
                  .filter((n) => n?.trim())
                  .join(' ')
                  .trim() || student.initials}
              </h2>
              <SharedStudentBadge roles={matchingRoles} />
              <TeamChatButton studentId={student.id} onNavigate={onClose} />
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 text-2xl font-light leading-none pb-1"
            >
              ×
            </button>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px px-6">
              <button
                onClick={() => setActiveTab('current')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'current'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Current Information
              </button>
              <button
                onClick={() => setActiveTab('iep')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'iep'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                IEP Goals
              </button>
              <button
                onClick={() => setActiveTab('assessments')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'assessments'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Assessments
              </button>
              <button
                onClick={() => setActiveTab('progress')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'progress'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Progress
              </button>
              {!isSecondary && (
                <button
                  onClick={() => setActiveTab('attendance')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'attendance'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Attendance
                </button>
              )}
              <button
                onClick={() => setActiveTab('accommodations')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'accommodations'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Accommodations
              </button>
            </nav>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto" style={{ maxHeight: '70vh' }}>
            {/* Current Information Tab */}
            {activeTab === 'current' && (
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Current Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="initials">Student Initials</Label>
                  <Input
                    id="initials"
                    type="text"
                    value={studentInfo.initials || ''}
                    onChange={(e) => setStudentInfo({...studentInfo, initials: e.target.value})}
                    placeholder="Enter student initials"
                    maxLength={10}
                    disabled={readOnly}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="grade_level">Grade Level</Label>
                  <select
                    id="grade_level"
                    value={studentInfo.grade_level}
                    onChange={(e) => setStudentInfo({...studentInfo, grade_level: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={readOnly}
                  >
                    <option value="TK">Transitional Kindergarten</option>
                    <option value="K">Kindergarten</option>
                    <option value="1">1st Grade</option>
                    <option value="2">2nd Grade</option>
                    <option value="3">3rd Grade</option>
                    <option value="4">4th Grade</option>
                    <option value="5">5th Grade</option>
                    <option value="6">6th Grade</option>
                    <option value="7">7th Grade</option>
                    <option value="8">8th Grade</option>
                    <option value="9">9th Grade</option>
                    <option value="10">10th Grade</option>
                    <option value="11">11th Grade</option>
                    <option value="12">12th Grade</option>
                  </select>
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="teacher">{isSecondary ? 'Teachers' : 'Teacher'}</Label>
                  {/* Locked until the set has loaded, and while a save is in
                      flight: an edit before the fetch lands is overwritten by
                      it, and one made during the save is not in the request
                      but looks saved. */}
                  <StudentTeachersField
                    value={teacherLinks}
                    onChange={setTeacherLinks}
                    isSecondary={isSecondary}
                    disabled={readOnly || loading || !linksLoaded}
                    schoolId={student.school_id || undefined}
                  />
                </FormGroup>
              </div>

              {/* Service minutes: elementary schedules discrete pull-out
                  sessions; a secondary resource caseload plans in minutes per
                  week (service embedded in class periods), stored as one
                  weekly bucket (1 × total). Other roles stay hidden on
                  secondary as before. */}
              {isSecondary && providerRole?.trim() === 'resource' && (
                <div className="space-y-3">
                  <FormGroup>
                    <Label htmlFor="weekly_minutes">Service Minutes per Week</Label>
                    <Input
                      id="weekly_minutes"
                      type="number"
                      min={1}
                      max={MAX_MINUTES_PER_SESSION}
                      value={
                        (studentInfo.sessions_per_week || 0) * (studentInfo.minutes_per_session || 0) || ''
                      }
                      onChange={(e) => {
                        const weekly = parseInt(e.target.value, 10);
                        setStudentInfo({
                          ...studentInfo,
                          sessions_per_week: 1,
                          minutes_per_session: Number.isFinite(weekly) && weekly > 0 ? weekly : 0,
                        });
                      }}
                      placeholder="e.g. 570"
                      disabled={readOnly}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Secondary resource service is planned as a weekly total, not individual
                      pull-out sessions.
                    </p>
                  </FormGroup>
                  {!readOnly && (
                    <IepMinutesConverter
                      onApply={(weekly) =>
                        setStudentInfo({
                          ...studentInfo,
                          sessions_per_week: 1,
                          minutes_per_session: weekly,
                        })
                      }
                    />
                  )}
                </div>
              )}
              {/* Related-service roles schedule discrete sessions at secondary
                  too (SPE-490), so they keep the pair; resource keeps the
                  weekly bucket above; other roles stay hidden on secondary. */}
              {(!isSecondary || canScheduleAtSecondary(providerRole)) && (
              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="sessions_per_week">Sessions per Week</Label>
                  <select
                    id="sessions_per_week"
                    value={studentInfo.sessions_per_week}
                    onChange={(e) => setStudentInfo({...studentInfo, sessions_per_week: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={readOnly}
                  >
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
                  </select>
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="minutes_per_session">Minutes per Session</Label>
                  <select
                    id="minutes_per_session"
                    value={studentInfo.minutes_per_session}
                    onChange={(e) => setStudentInfo({...studentInfo, minutes_per_session: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    disabled={readOnly}
                  >
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                    <option value="60">60</option>
                  </select>
                </FormGroup>
              </div>
              )}

              {/* Additional Details */}
              <div className="space-y-4 mt-6">
                <h4 className="font-medium text-gray-700 text-base">Additional Details</h4>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    type="text"
                    value={details.first_name}
                    onChange={(e) => setDetails({...details, first_name: e.target.value})}
                    placeholder="Enter first name"
                    disabled={readOnly}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    type="text"
                    value={details.last_name}
                    onChange={(e) => setDetails({...details, last_name: e.target.value})}
                    placeholder="Enter last name"
                    disabled={readOnly}
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={details.date_of_birth}
                    onChange={(e) => setDetails({...details, date_of_birth: e.target.value})}
                    disabled={readOnly}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="district_student_id">District Student ID</Label>
                  <Input
                    id="district_student_id"
                    type="text"
                    value={details.district_student_id}
                    onChange={(e) => setDetails({...details, district_student_id: e.target.value})}
                    placeholder="e.g. 100234"
                    disabled={readOnly}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    The student&apos;s ID in your district&apos;s system. Imports use it to match
                    this student reliably.
                  </p>
                </FormGroup>
              </div>


              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="iep_date">Upcoming IEP Date</Label>
                  <Input
                    id="iep_date"
                    type="date"
                    value={details.upcoming_iep_date}
                    onChange={(e) => setDetails({...details, upcoming_iep_date: e.target.value})}
                    disabled={readOnly}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="triennial_date">Upcoming Triennial IEP Date</Label>
                  <Input
                    id="triennial_date"
                    type="date"
                    value={details.upcoming_triennial_date}
                    onChange={(e) => setDetails({...details, upcoming_triennial_date: e.target.value})}
                    disabled={readOnly}
                  />
                </FormGroup>
              </div>
              </div>
            </div>
            )}

            {/* IEP Goals Tab */}
            {activeTab === 'iep' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <h3 className="font-medium text-gray-900">IEP Goals</h3>
                <p className="text-sm text-gray-600">
                  Add specific goals from the student's IEP
                </p>

                {/* IEP Date Warning */}
                {(() => {
                  const warning = getIepDateWarning(details.goals_iep_date);
                  if (warning.message) {
                    return (
                      <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                        <p className="text-sm text-yellow-800">
                          ⚠️ {warning.message}
                          {details.goals_iep_date && (
                            <span className="text-yellow-600 ml-1">
                              (IEP Date: {new Date(details.goals_iep_date + 'T00:00:00').toLocaleDateString()})
                            </span>
                          )}
                        </p>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm text-blue-800">
                    Speddy shows students by their initials throughout the app, so
                    you can enter goals just as they appear in your records. If you
                    prefer to leave out names or specific dates, that&apos;s fine too.
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                {!readOnly && (
                  <div className="space-y-3">
                    {/* Import from Excel */}
                    <IEPGoalsUploader
                      onUploadComplete={handleUploadComplete}
                      disabled={readOnly}
                      targetStudent={{
                        id: student.id,
                        initials: student.initials,
                        grade_level: student.grade_level
                      }}
                    />

                    {/* Add Goal Manually */}
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDetails({
                          ...details,
                          iep_goals: [...details.iep_goals, '']
                        })}
                        type="button"
                      >
                        + Add Goal Manually
                      </Button>
                    </div>
                  </div>
                )}

                {details.iep_goals.length === 0 ? (
                  <p className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-md">
                    No goals added yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {details.iep_goals.map((goal, index) => (
                      <div key={index} className="flex gap-2">
                        <textarea
                          value={goal}
                          onChange={(e) => {
                            const newGoals = [...details.iep_goals];
                            newGoals[index] = e.target.value;
                            setDetails({...details, iep_goals: newGoals});
                          }}
                          placeholder="Enter IEP goal as written in the IEP..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[150px] resize-y read-only:bg-gray-50 read-only:cursor-default"
                          readOnly={readOnly}
                        />
                        {!readOnly && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              const newGoals = details.iep_goals.filter((_, i) => i !== index);
                              setDetails({...details, iep_goals: newGoals});
                            }}
                            type="button"
                            className="self-start"
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            )}

            {/* Assessments Tab */}
            {activeTab === 'assessments' && (
              <AssessmentList
                studentId={student.id}
                readOnly={readOnly}
              />
            )}

            {/* Progress Tab */}
            {activeTab === 'progress' && (
              <StudentProgressTab
                studentId={student.id}
                iepGoals={details.iep_goals}
                schoolId={student.school_id || undefined}
                readOnly={readOnly}
              />
            )}

            {/* Attendance Tab */}
            {!isSecondary && activeTab === 'attendance' && (
              <StudentAttendanceTab studentId={student.id} />
            )}

            {/* Accommodations Tab */}
            {activeTab === 'accommodations' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="font-medium text-gray-900">Accommodations</h3>
                  <p className="text-sm text-gray-600">
                    Add IEP accommodations for this student
                  </p>
                </div>

                <div className="space-y-2">
                  {!readOnly && (
                    <AccommodationsPdfImport
                      studentId={student.id}
                      existingAccommodations={details.accommodations}
                      onAdd={(items) =>
                        setDetails({
                          ...details,
                          accommodations: [...details.accommodations, ...items],
                        })
                      }
                    />
                  )}
                  {!readOnly && (
                    <div className="flex justify-end">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setDetails({
                          ...details,
                          accommodations: [...details.accommodations, '']
                        })}
                        type="button"
                      >
                        + Add Accommodation
                      </Button>
                    </div>
                  )}

                  {details.accommodations.length === 0 ? (
                    <p className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-md">
                      No accommodations added yet
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {details.accommodations.map((accommodation, index) => (
                        <div key={index} className="flex gap-2">
                          <textarea
                            value={accommodation}
                            onChange={(e) => {
                              const newAccommodations = [...details.accommodations];
                              newAccommodations[index] = e.target.value;
                              setDetails({...details, accommodations: newAccommodations});
                            }}
                            placeholder="Enter accommodation..."
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px] resize-y read-only:bg-gray-50 read-only:cursor-default"
                            readOnly={readOnly}
                          />
                          {!readOnly && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                const newAccommodations = details.accommodations.filter((_, i) => i !== index);
                                setDetails({...details, accommodations: newAccommodations});
                              }}
                              type="button"
                              className="self-start"
                            >
                              Remove
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            {!readOnly && linksLoadFailed && (
              <span role="alert" className="mr-auto text-sm text-red-700">
                This student&apos;s details could not be loaded. Close and reopen to try again.
              </span>
            )}
            <Button variant="secondary" onClick={onClose}>
              {readOnly ? 'Close' : 'Cancel'}
            </Button>
            {!readOnly && (
              <Button
                variant="primary"
                onClick={handleSave}
                disabled={loading || !linksLoaded}
              >
                {loading ? 'Saving...' : 'Save Details'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>

      {/* Per-student IEP goals review (SPE-232): the shared review screen in
          target-student mode. The details panel above is hidden while this is
          open, so there is no stacked modal (SPE-224 decision). */}
      {importData && reviewModel && (
        <StudentImportReview
          isOpen={showImportPreview}
          model={reviewModel}
          onClose={() => {
            setShowImportPreview(false);
            setImportData(null);
          }}
          onConfirm={handleTargetImport}
          onComplete={handleImportComplete}
        />
      )}
    </>
  );
}