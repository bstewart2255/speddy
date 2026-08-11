/**
 * De-identification of student references sent to AI providers (SPE-61).
 *
 * Student initials never leave the application. Prompts carry positional
 * labels ("Student 1", "Student 2"); the model reasons over those labels, and
 * they are mapped back to the real initials on the response before anything is
 * validated, rendered, or printed. Teacher-facing output is unchanged.
 *
 * This matters beyond tidiness: the CA-NDPA disclosure commits to applying
 * prompt de-identification before any AI feature is enabled
 * (`docs/ndpa/ca-ndpa-execution-packet.md` §4).
 */

/** Maps between real student initials and the labels sent to the model. */
export interface StudentLabelMap {
  /** Label for each student, in the same order as the request's student list. */
  labels: string[];
  /** Label -> real initials, used to restore the model's response. */
  toInitials: Map<string, string>;
  /**
   * Normalized label -> real initials. Models routinely echo a label back with
   * different casing or punctuation ("student 1", "Student #1"); without this
   * the restore would miss and a teacher would see the placeholder on their
   * printout instead of the student's initials.
   */
  toInitialsNormalized: Map<string, string>;
}

/** Collapses formatting drift so "Student #1" and "student 1" both match. */
function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The student fields this module needs; a structural subset of `Student`. */
interface LabelableStudent {
  id: string;
  initials?: string;
}

/**
 * Build positional labels for a group of students.
 *
 * Labels are positional rather than derived from student data, so two students
 * who share initials still get distinct labels — an improvement on passing the
 * raw initials through.
 */
export function buildStudentLabelMap(students: LabelableStudent[]): StudentLabelMap {
  const labels: string[] = [];
  const toInitials = new Map<string, string>();
  const toInitialsNormalized = new Map<string, string>();

  students.forEach((student, index) => {
    const label = `Student ${index + 1}`;
    labels.push(label);
    // Mirrors the previous prompt behaviour: initials when present, id otherwise.
    const initials = student.initials || student.id;
    toInitials.set(label, initials);
    toInitialsNormalized.set(normalizeLabel(label), initials);
  });

  return { labels, toInitials, toInitialsNormalized };
}

/** Exact match first, then formatting-tolerant; unknown values pass through. */
function lookup(value: string, map: StudentLabelMap): string {
  return (
    map.toInitials.get(value) ??
    map.toInitialsNormalized.get(normalizeLabel(value)) ??
    value
  );
}

/**
 * Replace labels with real initials on a generated lesson, in place.
 *
 * Only the two fields the model is asked to echo back are touched — a targeted
 * swap rather than a deep string walk, so worksheet content that legitimately
 * mentions "Student 1" is left alone. A label the map doesn't know (the model
 * inventing an extra student, say) is preserved rather than dropped, so the
 * downstream validator still sees whatever the model produced.
 */
export function restoreStudentInitials(response: unknown, map: StudentLabelMap): void {
  const teacherLessonPlan = getTeacherLessonPlan(response);
  if (!teacherLessonPlan) return;

  const { studentInitials, studentProblems } = teacherLessonPlan;

  if (Array.isArray(studentInitials)) {
    teacherLessonPlan.studentInitials = studentInitials.map(value =>
      typeof value === 'string' ? lookup(value, map) : value
    );
  }

  if (Array.isArray(studentProblems)) {
    for (const entry of studentProblems) {
      if (entry && typeof entry === 'object' && typeof entry.studentInitials === 'string') {
        entry.studentInitials = lookup(entry.studentInitials, map);
      }
    }
  }
}

/** Shape of the response subtree this module rewrites. */
interface TeacherLessonPlanShape {
  studentInitials?: unknown;
  studentProblems?: Array<{ studentInitials?: unknown } | null | undefined>;
}

function getTeacherLessonPlan(response: unknown): TeacherLessonPlanShape | null {
  if (!response || typeof response !== 'object') return null;

  const lesson = (response as { lesson?: unknown }).lesson;
  if (!lesson || typeof lesson !== 'object') return null;

  const plan = (lesson as { teacherLessonPlan?: unknown }).teacherLessonPlan;
  if (!plan || typeof plan !== 'object') return null;

  return plan as TeacherLessonPlanShape;
}
