/**
 * SPE-398 · fetching, kept apart from analysing.
 *
 * READ-ONLY, in both directions, and that is a v1 requirement rather than a
 * habit: nothing here writes to a Speddy domain table, and nothing here writes
 * to the SIS. Persisting anything a district's SIS tells us is a separate
 * stop-and-discuss decision, so this module deliberately has no writer to
 * misuse — it exports fetches and nothing else.
 *
 * Everything is normalized into the shapes `analysis.ts` consumes, so a report
 * reads the same whether the district is on Aeries or OneRoster.
 */
import { AeriesClient } from '@/lib/integrations/aeries';
import {
  OneRosterClient,
  type RawOneRosterEnrollment,
  type RawOneRosterUser,
} from '@/lib/integrations/oneroster';
import { getDecryptedCredential, listConnections } from '@/lib/sis/connections';
import { createServiceClient } from '@/lib/supabase/server';
import {
  enrollmentsToTeacherLinks,
  type SchoolRow,
  type SisStudent,
  type SisTeacherLink,
  type SpeddyStudent,
} from './analysis';

/**
 * One way of reading "the district's student number" out of the SIS.
 *
 * Plural because we do not know which field a district's providers copied.
 * Aeries alone offers StudentID, StudentNumber and StateStudentID; guessing
 * wrong produces a 0% match rate that looks like a data problem at the
 * district. Report 1 tries each and says which one actually lines up.
 */
export interface IdCandidate {
  field: string;
  students: SisStudent[];
}

export interface DerivedForField {
  teacherLinks: SisTeacherLink[];
  /** District IDs flagged special education, in the chosen namespace. */
  spedDistrictIds?: string[];
}

export interface SisSnapshot {
  candidates: IdCandidate[];
  /**
   * Derived data, keyed to the identifier field the caller actually picks.
   *
   * A FUNCTION rather than a field, because the choice happens after the fetch.
   * The first version returned teacher links keyed on OneRoster's `identifier`
   * and Aeries' special-education flags keyed on `StudentID`, both hard-coded —
   * so the moment report 1 picked any other field, those two reports silently
   * compared different namespaces and produced total disagreement. Both bots
   * flagged it; it would have made the answer to the owner's named question
   * confidently wrong.
   */
  forField(field: string): DerivedForField;
  /** SIS teacher key → lowercased email, for resolving Speddy's teachers. */
  teacherEmails: Map<string, string>;
  /** What could not be fetched, and why. Printed with the report. */
  notes: string[];
}

// ---------------------------------------------------------------------------
// The Speddy side.
// ---------------------------------------------------------------------------

export async function loadSpeddyStudents(districtId: string): Promise<SpeddyStudent[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('students')
    .select('id, child_id, school_id, grade_level, teacher_id, district_student_id, children!inner(district_student_id)')
    .eq('district_id', districtId);
  if (error) throw new Error(`Could not read Speddy students: ${error.message}`);

  return (data ?? []).map((r: Record<string, unknown>) => {
    const child = r.children as { district_student_id: string | null } | null;
    return {
      studentId: String(r.id),
      childId: String(r.child_id),
      // The child record is canonical (SPE-347); the column on `students` is
      // the pre-backfill copy. Both are read so the report can count the rows
      // where the backfill never landed as OUR gap rather than the district's.
      districtStudentId: child?.district_student_id ?? null,
      legacyDistrictStudentId: r.district_student_id ? String(r.district_student_id) : null,
      schoolId: r.school_id ? String(r.school_id) : null,
      gradeLevel: String(r.grade_level ?? ''),
      teacherId: r.teacher_id ? String(r.teacher_id) : null,
    };
  });
}

export async function loadSchools(districtId: string): Promise<SchoolRow[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('schools')
    .select('id, name, school_type, grade_span_low')
    .eq('district_id', districtId);
  if (error) throw new Error(`Could not read schools: ${error.message}`);
  return (data ?? []) as SchoolRow[];
}

/**
 * Speddy teacher id → lowercased email.
 *
 * Email is the only join we have: `teachers` carries no SIS key. Where a
 * teacher has no email, or the district's SIS holds a different one, the
 * linkage report counts them "unresolvable" rather than guessing — which is
 * itself a finding worth reading.
 */
export async function loadSpeddyTeacherEmails(districtId: string): Promise<Map<string, string>> {
  const supabase = createServiceClient();
  // The error is checked, not discarded: a failed lookup returning an empty map
  // would classify EVERY teacher as unresolvable and read as a finding about
  // the district's data rather than a Speddy read failure.
  const { data: schools, error: schoolsError } = await supabase
    .from('schools')
    .select('id')
    .eq('district_id', districtId);
  if (schoolsError) throw new Error(`Could not read schools: ${schoolsError.message}`);
  const schoolIds = (schools ?? []).map((s: { id: string }) => s.id);
  if (schoolIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from('teachers')
    .select('id, email')
    .in('school_id', schoolIds);
  if (error) throw new Error(`Could not read teachers: ${error.message}`);

  const map = new Map<string, string>();
  for (const t of (data ?? []) as { id: string; email: string | null }[]) {
    if (t.email) map.set(t.id, t.email.trim().toLowerCase());
  }
  return map;
}

/** Resolve the stored, decrypted connection for a district. */
export async function loadConnection(districtId: string) {
  const connections = await listConnections(districtId);
  const connection = connections.find((c) => c.status !== 'disabled' && c.credential_hint);
  if (!connection) {
    throw new Error(
      `No SIS connection with a stored credential for district ${districtId}. ` +
        'Set one up in the tech portal first.',
    );
  }
  const credential = await getDecryptedCredential(connection.id);
  if (!credential) throw new Error('The stored connection has no readable credential.');
  return { connection, credential };
}

// ---------------------------------------------------------------------------
// The SIS side.
// ---------------------------------------------------------------------------

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === '' ? null : String(v);

export async function fetchAeries(client: AeriesClient): Promise<SisSnapshot> {
  const notes: string[] = [];
  const schools = await client.getSchools({ fields: ['SchoolCode'] });
  const codes = schools.map((s) => s.SchoolCode).filter((c) => Number.isFinite(c));

  const rows: Record<string, unknown>[] = [];
  for (const code of codes) {
    const page = await client.getAllPages<Record<string, unknown>>(`schools/${code}/students`, {
      fields: ['StudentID', 'StudentNumber', 'StateStudentID', 'SchoolCode', 'Grade'],
    });
    rows.push(...page);
  }

  // Every candidate, built from ONE fetch — asking three times would triple the
  // load on a district's production SIS to answer one question.
  const candidateFields = ['StudentID', 'StudentNumber', 'StateStudentID'] as const;
  const candidates: IdCandidate[] = candidateFields.map((field) => ({
    field,
    students: rows.map((r) => ({
      sisId: String(r.StudentID ?? ''),
      districtStudentId: str(r[field]),
      schoolId: str(r.SchoolCode),
      gradeLevel: str(r.Grade),
    })),
  }));

  const teacherEmails = new Map<string, string>();
  for (const code of codes) {
    const teachers = await client.getSchoolTeachers(code, {
      fields: ['TeacherNumber', 'EmailAddress'],
    });
    for (const t of teachers) {
      const email = str(t.EmailAddress);
      if (email) teacherEmails.set(String(t.TeacherNumber), email.toLowerCase());
    }
  }

  // Special education: program 144, plus 144x for students under evaluation.
  const spedIds = new Set<string>();
  for (const code of codes) {
    for (const programCode of ['144', '144x']) {
      const programs = await client.getStudentPrograms(code, 0, programCode, {
        fields: ['StudentID'],
      });
      for (const p of programs as Record<string, unknown>[]) {
        const id = str(p.StudentID);
        if (id) spedIds.add(id);
      }
    }
  }

  // Stated, not silently omitted. Aeries expresses student↔teacher through
  // class schedules, which our client does not speak yet — that endpoint work
  // is SPE-342, and inventing a response shape here that no real instance has
  // confirmed would produce a distribution that looks authoritative and is not.
  notes.push(
    'Teacher linkage was NOT collected over Aeries: the class-schedule endpoints are not implemented ' +
      'in lib/integrations/aeries yet (SPE-342). Report 3 will show zero secondary students with SIS ' +
      'teachers — that is a gap in this tool, not a finding about the district.',
  );

  // StudentID → this row's value for each candidate field, so the flags can be
  // translated into whichever namespace report 1 selects.
  const byStudentId = new Map<string, Record<string, string | null>>();
  for (const r of rows) {
    const key = str(r.StudentID);
    if (key) {
      byStudentId.set(key, Object.fromEntries(candidateFields.map((f) => [f, str(r[f])])));
    }
  }

  return {
    candidates,
    forField: (field) => ({
      teacherLinks: [],
      spedDistrictIds: [...spedIds]
        .map((sid) => byStudentId.get(sid)?.[field] ?? null)
        .filter((v): v is string => !!v),
    }),
    teacherEmails,
    notes,
  };
}

export async function fetchOneRoster(client: OneRosterClient): Promise<SisSnapshot> {
  const notes: string[] = [];
  // Paged to completion. A fixed `limit` silently truncates a large district,
  // and a short roster makes THEIR data look incomplete when the loss was ours.
  const students = await client.getAllPages<RawOneRosterUser>('students', 'users');

  const candidates: IdCandidate[] = (['identifier', 'sourcedId'] as const).map((field) => ({
    field,
    students: students.map((s) => ({
      sisId: s.sourcedId,
      districtStudentId: str(s[field]),
      schoolId: s.orgs?.[0]?.sourcedId ?? null,
      gradeLevel: s.grades?.[0] ?? null,
    })),
  }));

  const teacherEmails = new Map<string, string>();
  for (const t of await client.getAllPages<RawOneRosterUser>('teachers', 'users')) {
    if (t.email) teacherEmails.set(t.sourcedId, t.email.trim().toLowerCase());
  }

  const enrollments = await client.getAllPages<RawOneRosterEnrollment>('enrollments', 'enrollments');

  notes.push(
    'OneRoster carries no special-education flag, so report 4 is unavailable on this path. ' +
      'That is a property of the standard (SPE-392), not a permission the district can grant.',
  );

  return {
    candidates,
    // Built per chosen field, not hard-coded to `identifier`. Keying the links
    // on a different field than the analysis joins on reports every matched
    // secondary student as having no teachers, and 0% coverage.
    forField: (field) => {
      const bySourcedId = new Map<string, string>();
      for (const st of students) {
        const value = field === 'sourcedId' ? st.sourcedId : st[field];
        if (value) bySourcedId.set(st.sourcedId, String(value));
      }
      return { teacherLinks: enrollmentsToTeacherLinks(enrollments, bySourcedId) };
    },
    teacherEmails,
    notes,
  };
}
