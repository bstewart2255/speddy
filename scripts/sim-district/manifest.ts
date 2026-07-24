/**
 * Sim District manifest — THE single source of truth for every identity the
 * sim district owns. See docs/SIM_DISTRICT.md (spec) before changing anything.
 *
 * Pure data + pure functions only. No I/O, no env access, no Supabase client —
 * seed/teardown/verify all derive their world from this file, which is what
 * makes the safety invariants checkable:
 *   - every seeded row carries an ID that is either written here or derived
 *     deterministically (SHA-256 over SIM_UUID_NAMESPACE + a natural key
 *     listed here, formatted as an RFC 9562 UUIDv8);
 *   - auth users are the one exception: their manifest-owned identity is the
 *     @sim.speddy.test email; UUIDs are resolved at runtime.
 */

import { createHash, createHmac } from 'node:crypto';

// ---------------------------------------------------------------------------
// Pins & namespace
// ---------------------------------------------------------------------------

/** Supabase project this manifest is allowed to touch. Preflight hard-fails on mismatch. */
export const SUPABASE_PROJECT_REF = 'qkcruccytmmdajfavpgb';

/** Reserved, undeliverable email domain — the sole sim identity namespace. */
export const SIM_EMAIL_DOMAIN = 'sim.speddy.test';

/** Fixed namespace for all derived sim IDs. Never change after first seed. */
export const SIM_UUID_NAMESPACE = '51dd0000-5e1f-4a11-b0b0-000000000001';

/**
 * Deterministic name-based UUID: SHA-256 over namespace + name, laid out as an
 * RFC 9562 UUIDv8 (the version reserved for custom schemes). Same stable-ID
 * property as UUIDv5 without SHA-1 (CodeQL: weak-crypto).
 */
export function simUuid(name: string, namespace: string = SIM_UUID_NAMESPACE): string {
  const nsBytes = Buffer.from(namespace.replace(/-/g, ''), 'hex');
  const hash = createHash('sha256')
    .update(nsBytes)
    .update(Buffer.from(name, 'utf8'))
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x80; // version 8 (custom)
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Per-persona password derived from the single SIM_DISTRICT_PASSWORD secret.
 * Distinct per account; one secret to manage; rotate by re-running sim:reset
 * with a new secret. Suffix guarantees upper/lower/digit/symbol.
 */
export function derivePassword(secret: string, email: string): string {
  const mac = createHmac('sha256', secret).update(email.toLowerCase()).digest('base64url');
  return `${mac.slice(0, 16)}aZ4!`;
}

/** School-year label, same convention as lib/school-year.ts ("2025-2026", flips Aug 1). */
export function schoolYearFor(date: Date): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  return month >= 8 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

export function simEmail(localpart: string): string {
  return `${localpart}@${SIM_EMAIL_DOMAIN}`;
}

// ---------------------------------------------------------------------------
// District & schools (spec §4)
// ---------------------------------------------------------------------------

export const DISTRICT = {
  id: 'SIM-D001',
  name: 'Sim Unified School District',
  state_id: 'CA',
  district_type: 'Unified',
  city: 'Simville',
  county: 'Sim County',
  zip: '95999',
  website: 'https://sim.speddy.test',
} as const;

export interface SimSchool {
  id: string;
  name: string;
  school_type: 'Elementary' | 'Middle' | 'High';
  grade_span_low: string;
  grade_span_high: string;
  /** Secondary sites get no seeded session instances (spec §7). */
  isSecondary: boolean;
  /** Grades used for seeded students/bell schedules (app-supported values only). */
  studentGrades: string[];
}

export const SCHOOLS: SimSchool[] = [
  { id: 'SIM-S001', name: 'Sim Willow Elementary', school_type: 'Elementary', grade_span_low: 'TK', grade_span_high: '5', isSecondary: false, studentGrades: ['K', '1', '2', '3', '4', '5'] },
  { id: 'SIM-S002', name: 'Sim Maple Elementary', school_type: 'Elementary', grade_span_low: 'TK', grade_span_high: '5', isSecondary: false, studentGrades: ['K', '1', '2', '3', '4', '5'] },
  { id: 'SIM-S003', name: 'Sim Juniper Elementary', school_type: 'Elementary', grade_span_low: 'TK', grade_span_high: '5', isSecondary: false, studentGrades: ['K', '1', '2', '3', '4', '5'] },
  { id: 'SIM-S004', name: 'Sim Cedar Middle School', school_type: 'Middle', grade_span_low: '6', grade_span_high: '8', isSecondary: true, studentGrades: ['6', '7', '8'] },
  { id: 'SIM-S005', name: 'Sim Redwood High School', school_type: 'High', grade_span_low: '9', grade_span_high: '12', isSecondary: true, studentGrades: ['9', '10', '11', '12'] },
];

export const WILLOW = 'SIM-S001';
export const MAPLE = 'SIM-S002';
export const JUNIPER = 'SIM-S003';
export const CEDAR = 'SIM-S004';
export const REDWOOD = 'SIM-S005';

export function schoolById(id: string): SimSchool {
  const school = SCHOOLS.find(s => s.id === id);
  if (!school) throw new Error(`Unknown sim school id: ${id}`);
  return school;
}

// ---------------------------------------------------------------------------
// Personas (spec §5) — auth identity is the email
// ---------------------------------------------------------------------------

export type SimRole =
  | 'district_admin'
  | 'site_admin'
  | 'resource'
  | 'speech'
  | 'ot'
  | 'sea'
  | 'teacher';

export interface SimPersona {
  /** Stable natural key used in derived IDs. Never rename after first seed. */
  key: string;
  fullName: string;
  role: SimRole;
  emailLocal: string;
  /** All schools this persona works at; first entry is primary. Empty = district-wide. */
  schoolIds: string[];
  /** Mon=1..Fri=5 workdays per school, for multi-site providers (user_site_schedules). */
  workDays?: Record<string, number[]>;
  /** For teacher personas: their homeroom grade. */
  gradeLevel?: string;
}

export const PERSONAS: SimPersona[] = [
  { key: 'dana', fullName: 'Dana Alvarez-Sim', role: 'district_admin', emailLocal: 'district.admin', schoolIds: [] },
  { key: 'priya', fullName: 'Priya Natarajan-Sim', role: 'site_admin', emailLocal: 'siteadmin.willow', schoolIds: [WILLOW] },
  { key: 'elena', fullName: 'Elena Rodriguez-Sim', role: 'site_admin', emailLocal: 'siteadmin.maple', schoolIds: [MAPLE] },
  { key: 'kwame', fullName: 'Kwame Mensah-Sim', role: 'site_admin', emailLocal: 'siteadmin.juniper', schoolIds: [JUNIPER] },
  { key: 'marcus', fullName: 'Marcus Webb-Sim', role: 'site_admin', emailLocal: 'siteadmin.cedar', schoolIds: [CEDAR] },
  { key: 'naomi', fullName: 'Naomi Castillo-Sim', role: 'site_admin', emailLocal: 'siteadmin.redwood', schoolIds: [REDWOOD] },
  { key: 'rachel', fullName: 'Rachel Okafor-Sim', role: 'resource', emailLocal: 'rsp.willow', schoolIds: [WILLOW] },
  { key: 'alicia', fullName: 'Alicia Grant-Sim', role: 'resource', emailLocal: 'rsp.maple', schoolIds: [MAPLE] },
  { key: 'derek', fullName: 'Derek Holloway-Sim', role: 'resource', emailLocal: 'rsp.juniper', schoolIds: [JUNIPER] },
  {
    key: 'maria', fullName: 'Maria Vasquez-Sim', role: 'resource', emailLocal: 'rsp.itinerant',
    schoolIds: [MAPLE, JUNIPER],
    workDays: { [MAPLE]: [1, 2, 3], [JUNIPER]: [4, 5] },
  },
  { key: 'hannah', fullName: 'Hannah Cho-Sim', role: 'resource', emailLocal: 'rsp.cedar', schoolIds: [CEDAR] },
  { key: 'victor', fullName: 'Victor Chen-Sim', role: 'resource', emailLocal: 'rsp.redwood', schoolIds: [REDWOOD] },
  {
    key: 'tomas', fullName: 'Tomás Reyes-Sim', role: 'speech', emailLocal: 'slp.itinerant',
    schoolIds: [WILLOW, JUNIPER, CEDAR],
    workDays: { [WILLOW]: [1, 2], [JUNIPER]: [3], [CEDAR]: [4, 5] },
  },
  {
    key: 'jun', fullName: 'Jun Park-Sim', role: 'ot', emailLocal: 'ot.itinerant',
    schoolIds: [MAPLE, REDWOOD],
    workDays: { [MAPLE]: [1, 2, 3], [REDWOOD]: [4, 5] },
  },
  { key: 'leah', fullName: 'Leah Kim-Sim', role: 'sea', emailLocal: 'sea.willow', schoolIds: [WILLOW] },
  { key: 'nora', fullName: 'Nora Ellison-Sim', role: 'teacher', emailLocal: 'teacher.willow.1', schoolIds: [WILLOW], gradeLevel: '3' },
  { key: 'david', fullName: 'David Osei-Sim', role: 'teacher', emailLocal: 'teacher.willow.2', schoolIds: [WILLOW], gradeLevel: '5' },
  { key: 'fatima', fullName: 'Fatima Haddad-Sim', role: 'teacher', emailLocal: 'teacher.cedar', schoolIds: [CEDAR], gradeLevel: '7' },
];

export function persona(key: string): SimPersona {
  const p = PERSONAS.find(x => x.key === key);
  if (!p) throw new Error(`Unknown sim persona: ${key}`);
  return p;
}

export function personaEmail(key: string): string {
  return simEmail(persona(key).emailLocal);
}

export const ALL_SIM_EMAILS = PERSONAS.map(p => simEmail(p.emailLocal));

// ---------------------------------------------------------------------------
// Record-only teachers (no login) — spec §5
// ---------------------------------------------------------------------------

export interface RecordTeacher {
  key: string;
  firstName: string;
  lastName: string;
  schoolId: string;
  gradeLevel: string;
}

export const RECORD_TEACHERS: RecordTeacher[] = [
  { key: 'omar', firstName: 'Omar', lastName: 'Bautista-Sim', schoolId: WILLOW, gradeLevel: 'K' },
  { key: 'grace', firstName: 'Grace', lastName: 'Lindqvist-Sim', schoolId: WILLOW, gradeLevel: '1' },
  { key: 'yuki', firstName: 'Yuki', lastName: 'Tanaka-Sim', schoolId: WILLOW, gradeLevel: '2' },
  { key: 'carmen', firstName: 'Carmen', lastName: 'Vega-Sim', schoolId: WILLOW, gradeLevel: '4' },
  { key: 'paul', firstName: 'Paul', lastName: 'Whitfield-Sim', schoolId: WILLOW, gradeLevel: '5' },
  { key: 'ines', firstName: 'Ines', lastName: 'Moreau-Sim', schoolId: MAPLE, gradeLevel: '1' },
  { key: 'sofia', firstName: 'Sofia', lastName: 'Andersson-Sim', schoolId: MAPLE, gradeLevel: '2' },
  { key: 'ravi', firstName: 'Ravi', lastName: 'Patel-Sim', schoolId: MAPLE, gradeLevel: '3' },
  { key: 'lena', firstName: 'Lena', lastName: 'Hoffmann-Sim', schoolId: MAPLE, gradeLevel: '5' },
  { key: 'miguel', firstName: 'Miguel', lastName: 'Santos-Sim', schoolId: JUNIPER, gradeLevel: 'K' },
  { key: 'aisha', firstName: 'Aisha', lastName: 'Diallo-Sim', schoolId: JUNIPER, gradeLevel: '2' },
  { key: 'peter', firstName: 'Peter', lastName: 'Novak-Sim', schoolId: JUNIPER, gradeLevel: '3' },
  { key: 'hana', firstName: 'Hana', lastName: 'Suzuki-Sim', schoolId: JUNIPER, gradeLevel: '5' },
  { key: 'henry', firstName: 'Henry', lastName: 'Adeyemi-Sim', schoolId: CEDAR, gradeLevel: '6' },
  { key: 'olga', firstName: 'Olga', lastName: 'Petrova-Sim', schoolId: CEDAR, gradeLevel: '8' },
  { key: 'diane', firstName: 'Diane', lastName: 'Kowalski-Sim', schoolId: REDWOOD, gradeLevel: '9' },
  { key: 'robert', firstName: 'Robert', lastName: 'Ngata-Sim', schoolId: REDWOOD, gradeLevel: '10' },
  { key: 'lucia', firstName: 'Lucia', lastName: 'Moretti-Sim', schoolId: REDWOOD, gradeLevel: '11' },
];

export function teacherRecordId(key: string): string {
  return simUuid(`teacher:${key}`);
}

// ---------------------------------------------------------------------------
// Caseloads (spec §6) — generator rules, not hand-written rows
// ---------------------------------------------------------------------------

export interface CaseloadRule {
  providerKey: string;
  schoolId: string;
  count: number;
  serviceType: 'resource' | 'speech' | 'ot';
}

/** 202 students total; elementary session population = 136 (spec §6/§7). */
export const CASELOADS: CaseloadRule[] = [
  { providerKey: 'rachel', schoolId: WILLOW, count: 28, serviceType: 'resource' },
  { providerKey: 'alicia', schoolId: MAPLE, count: 26, serviceType: 'resource' },
  { providerKey: 'derek', schoolId: JUNIPER, count: 24, serviceType: 'resource' },
  { providerKey: 'maria', schoolId: MAPLE, count: 10, serviceType: 'resource' },
  { providerKey: 'maria', schoolId: JUNIPER, count: 10, serviceType: 'resource' },
  { providerKey: 'hannah', schoolId: CEDAR, count: 18, serviceType: 'resource' },
  { providerKey: 'victor', schoolId: REDWOOD, count: 20, serviceType: 'resource' },
  { providerKey: 'tomas', schoolId: WILLOW, count: 15, serviceType: 'speech' },
  { providerKey: 'tomas', schoolId: JUNIPER, count: 15, serviceType: 'speech' },
  { providerKey: 'tomas', schoolId: CEDAR, count: 18, serviceType: 'speech' },
  { providerKey: 'jun', schoolId: MAPLE, count: 8, serviceType: 'ot' },
  { providerKey: 'jun', schoolId: REDWOOD, count: 10, serviceType: 'ot' },
];

export const TOTAL_STUDENTS = CASELOADS.reduce((n, c) => n + c.count, 0); // 202

export function studentId(providerKey: string, schoolId: string, index: number): string {
  return simUuid(`student:${providerKey}:${schoolId}:${index}`);
}

/** Deterministic frequency/minutes mix (index-cycled). */
const FREQ_MIX = [2, 1, 3, 2, 1] as const;
const MINUTES_MIX = [30, 30, 20, 25, 30] as const;

export function sessionMix(index: number): { sessionsPerWeek: number; minutes: number } {
  return { sessionsPerWeek: FREQ_MIX[index % FREQ_MIX.length], minutes: MINUTES_MIX[index % MINUTES_MIX.length] };
}

export function studentInitials(providerKey: string, schoolId: string, index: number): string {
  // "Same child on two caseloads" quirk (spec §6): Tomás's first two Willow
  // students mirror Rachel's first two (same initials + teacher).
  if (providerKey === 'tomas' && schoolId === WILLOW && index < 2) {
    return studentInitials('rachel', WILLOW, index);
  }
  const seed = createHash('sha1').update(`initials:${providerKey}:${schoolId}:${index}`).digest();
  return String.fromCharCode(65 + (seed[0] % 26)) + String.fromCharCode(65 + (seed[1] % 26));
}

export function studentGrade(rule: CaseloadRule, index: number): string {
  if (rule.providerKey === 'tomas' && rule.schoolId === WILLOW && index < 2) {
    return studentGrade({ providerKey: 'rachel', schoolId: WILLOW, count: 28, serviceType: 'resource' }, index);
  }
  const grades = schoolById(rule.schoolId).studentGrades;
  return grades[index % grades.length];
}

/**
 * Homeroom teacher assignment. Rules (spec §6):
 *  - Rachel's students 0-2 (and Tomás's Willow mirrors 0-1) → Nora (login teacher).
 *  - David gets ZERO students (teacher empty state).
 *  - Grade-7 students at Cedar → Fatima; everything else cycles the school's
 *    record-only teachers.
 * Returns a teachers-table row id + display name.
 */
export function studentTeacher(rule: CaseloadRule, index: number): { teacherRowId: string; teacherName: string } {
  const grade = studentGrade(rule, index);
  if (rule.schoolId === WILLOW && index < (rule.providerKey === 'rachel' ? 3 : rule.providerKey === 'tomas' ? 2 : 0)) {
    return { teacherRowId: teacherRecordId('login:nora'), teacherName: 'Nora Ellison-Sim' };
  }
  if (rule.schoolId === CEDAR && grade === '7') {
    return { teacherRowId: teacherRecordId('login:fatima'), teacherName: 'Fatima Haddad-Sim' };
  }
  const pool = RECORD_TEACHERS.filter(t => t.schoolId === rule.schoolId);
  const t = pool[index % pool.length];
  return { teacherRowId: teacherRecordId(t.key), teacherName: `${t.firstName} ${t.lastName}` };
}

// Edge-case rows (spec §6), all on Rachel's Willow caseload:
export const EDGE = {
  /** Index of the student with zero scheduled sessions (unscheduled alert). */
  zeroSessionsIndex: 5,
  /** Index whose non-grouped sessions are all delegated to the SEA (Leah). */
  seaDelegatedIndex: 2,
  /** Index with a manually placed session. */
  manuallyPlacedIndex: 6,
} as const;

// ---------------------------------------------------------------------------
// Groups v2 fixture (SPE-315) — durable session_groups records + a
// per-(studentIndex, k) assignment map, all on Rachel's Willow caseload. Three
// permanent regression scenarios, seeded by seed.ts and asserted by verify.ts:
//   1. Multi-day group — Reading Group A meets Tue AND Thu at 10:30 with the
//      SAME two members (indexes 3 & 8): different days, ONE record (design
//      decision #4).
//   2. Split slot      — Reading Group B (indexes 9 & 11) occupies Group A's
//      Tue 10:30 slot: two distinct groups sharing one (provider, day, time).
//   3. SEA-run cluster — a whole group delivered by the SEA: indexes 2 & 14
//      co-scheduled Wed 10:30, delivered_by='sea', assigned_to_sea_id = Leah.
// Every grouped schedule_session dual-writes the durable group_ref (record id)
// AND the legacy group_id/group_name/group_color, matching the app's writes.
// Members are picked so each student's grouped and ungrouped slots stay on
// distinct (day_of_week, start_time) pairs (the unique_session_per_date guard),
// and so exactly one group is multi-day and exactly one slot is split.
// ---------------------------------------------------------------------------

export interface SimGroup {
  /** Stable natural key; drives the derived UUIDs. Never rename after first seed. */
  key: string;
  /** session_groups.id — the durable record grouped sessions group_ref to. */
  recordId: string;
  /** Legacy schedule_sessions.group_id, dual-written beside group_ref. */
  legacyId: string;
  name: string;
  /** session_groups.color / schedule_sessions.group_color — CHECK 0..4. */
  color: number;
  deliveredBy: 'provider' | 'sea';
}

export const SESSION_GROUPS: SimGroup[] = [
  { key: 'reading-a', recordId: simUuid('group:rachel:reading-a:record'), legacyId: simUuid('group:rachel:reading-a'), name: 'Reading Group A', color: 3, deliveredBy: 'provider' },
  { key: 'reading-b', recordId: simUuid('group:rachel:reading-b:record'), legacyId: simUuid('group:rachel:reading-b'), name: 'Reading Group B', color: 1, deliveredBy: 'provider' },
  { key: 'sea-cluster', recordId: simUuid('group:rachel:sea-cluster:record'), legacyId: simUuid('group:rachel:sea-cluster'), name: 'SEA Reading Cluster', color: 4, deliveredBy: 'sea' },
];

export function simGroup(key: string): SimGroup {
  const g = SESSION_GROUPS.find(x => x.key === key);
  if (!g) throw new Error(`Unknown sim group key: ${key}`);
  return g;
}

/**
 * Grouped-session assignment: which of Rachel's (studentIndex, k) sessions is
 * repurposed into a group, and the slot it moves to. Grouping never adds a
 * session — it relabels an existing weekly slot with the group's day/time +
 * group columns.
 */
export interface GroupAssignment {
  index: number;   // Rachel Willow student index
  k: number;       // which weekly session (0-based) is grouped
  groupKey: string;
  day: number;     // Mon=1..Fri=5
  start: string;   // HH:MM (a SESSION_SLOTS value)
}

export const GROUP_ASSIGNMENTS: GroupAssignment[] = [
  // 1. Multi-day: Reading Group A, same members on two days at the same time.
  { index: 3, k: 0, groupKey: 'reading-a', day: 2, start: '10:30' }, // Tue
  { index: 3, k: 1, groupKey: 'reading-a', day: 4, start: '10:30' }, // Thu
  { index: 8, k: 0, groupKey: 'reading-a', day: 2, start: '10:30' },
  { index: 8, k: 1, groupKey: 'reading-a', day: 4, start: '10:30' },
  // 2. Split slot: Reading Group B shares Group A's Tue 10:30 slot.
  { index: 9, k: 0, groupKey: 'reading-b', day: 2, start: '10:30' },
  { index: 11, k: 0, groupKey: 'reading-b', day: 2, start: '10:30' },
  // 3. SEA-run cluster: whole group delivered by Leah, Wed 10:30. Index 2 is
  //    also the standalone SEA-delegated student (seaDelegatedIndex).
  { index: 2, k: 0, groupKey: 'sea-cluster', day: 3, start: '10:30' },
  { index: 14, k: 0, groupKey: 'sea-cluster', day: 3, start: '10:30' },
];

/** The group slot for Rachel's student `index` at weekly session `k`, if any. */
export function groupAssignmentFor(index: number, k: number): GroupAssignment | undefined {
  return GROUP_ASSIGNMENTS.find(a => a.index === index && a.k === k);
}

// ---------------------------------------------------------------------------
// Student details (fictional-by-construction; spec §6)
// ---------------------------------------------------------------------------

const FIRST_NAMES = ['Maya', 'Leo', 'Ava', 'Noah', 'Mia', 'Eli', 'Zoe', 'Kai', 'Ivy', 'Max', 'Lila', 'Sam', 'Nia', 'Ben', 'Ada', 'Theo', 'Uma', 'Rex', 'Isla', 'Jude'];
const LAST_NAMES = ['Torres', 'Kim', 'Patel', 'Nguyen', 'Garcia', 'Okafor', 'Silva', 'Haddad', 'Novak', 'Diallo'];

/** How many student_details rows per caseload rule (≈60 total). */
export function detailsCount(rule: CaseloadRule): number {
  const per: Record<string, number> = {
    'rachel:SIM-S001': 12, 'alicia:SIM-S002': 8, 'derek:SIM-S003': 8, 'maria:SIM-S002': 3,
    'maria:SIM-S003': 3, 'hannah:SIM-S004': 8, 'victor:SIM-S005': 8, 'tomas:SIM-S001': 6, 'jun:SIM-S002': 4,
  };
  return per[`${rule.providerKey}:${rule.schoolId}`] ?? 0;
}

export function studentFullName(providerKey: string, schoolId: string, index: number): { firstName: string; lastName: string } {
  // "Same child on two caseloads" (spec §6): Tomás's first two Willow students
  // mirror Rachel's first two on initials + grade + teacher. SPE-290 makes the
  // cross-provider match prefer the FULL NAME, so the shared pair must share the
  // name too — otherwise the (correct) name-based match no longer recognizes them.
  if (providerKey === 'tomas' && schoolId === WILLOW && index < 2) {
    return studentFullName('rachel', WILLOW, index);
  }
  const seed = createHash('sha1').update(`name:${providerKey}:${schoolId}:${index}`).digest();
  return {
    firstName: FIRST_NAMES[seed[0] % FIRST_NAMES.length],
    lastName: `${LAST_NAMES[seed[1] % LAST_NAMES.length]}-Sim`,
  };
}

export const IEP_GOAL_BANK = [
  'Given a grade-level passage, student will read with 95% accuracy in 3 of 4 trials.',
  'Student will solve two-step word problems with 80% accuracy across 4 consecutive sessions.',
  'Student will produce target speech sounds at the sentence level with 90% accuracy.',
  'Student will write a five-sentence paragraph with correct capitalization and punctuation in 4 of 5 samples.',
  'Student will use a self-regulation strategy before responding in 4 of 5 observed opportunities.',
];

export const ACCOMMODATION_BANK = [
  'Preferential seating',
  'Extended time (1.5x) on assessments',
  'Directions repeated and checked for understanding',
  'Frequent movement breaks',
  'Reduced visual clutter on worksheets',
];

// ---------------------------------------------------------------------------
// Schedules (spec §7)
// ---------------------------------------------------------------------------

/**
 * Bell schedules model BLOCKED (non-teaching) windows, and period_name has a
 * CHECK constraint (20260103_add_daily_time_period_names.sql):
 * Recess | Lunch | Lunch Recess | Snack | PE | School Start | Dismissal |
 * Early Dismissal. Session slots below deliberately avoid these windows.
 */
export const BELL_PERIODS = [
  { name: 'School Start', start: '08:15', end: '08:30' },
  { name: 'Recess', start: '10:00', end: '10:15' },
  { name: 'Lunch', start: '11:45', end: '12:30' },
  { name: 'Dismissal', start: '14:30', end: '14:45' },
] as const;

export const SESSION_SLOTS = ['08:45', '09:30', '10:30', '12:45', '13:30'] as const;

export const SCHOOL_DAY = { start: '08:30', end: '14:30' } as const;

/** Session instance window: weekdays within ±14 days of the seed date. */
export const INSTANCE_WINDOW_DAYS = 14;

export function bellScheduleId(schoolId: string, grade: string, day: number, period: string): string {
  return simUuid(`bell:${schoolId}:${grade}:${day}:${period}`);
}

export function schoolHoursId(providerKey: string, schoolId: string, grade: string, day: number): string {
  return simUuid(`hours:${providerKey}:${schoolId}:${grade}:${day}`);
}

export function specialActivityId(schoolId: string, teacherKey: string, activity: string): string {
  return simUuid(`activity:${schoolId}:${teacherKey}:${activity}`);
}

export function providerSchoolId(personaKey: string, schoolId: string): string {
  return simUuid(`provsch:${personaKey}:${schoolId}`);
}

export function userSiteScheduleId(personaKey: string, schoolId: string, day: number): string {
  return simUuid(`usq:${personaKey}:${schoolId}:${day}`);
}

export function sessionTemplateId(studentUuid: string, slot: number): string {
  return simUuid(`template:${studentUuid}:${slot}`);
}

export function sessionInstanceId(templateUuid: string, isoDate: string): string {
  return simUuid(`instance:${templateUuid}:${isoDate}`);
}

export function attendanceId(instanceUuid: string): string {
  return simUuid(`attendance:${instanceUuid}`);
}

export function studentDetailsId(studentUuid: string): string {
  return simUuid(`details:${studentUuid}`);
}

export const SPECIAL_ACTIVITIES = ['PE', 'Music', 'Library'] as const;

// ---------------------------------------------------------------------------
// CARE referrals (spec §7) — 6 fixed rows
// ---------------------------------------------------------------------------

export interface CareSpec {
  key: string;
  schoolId: string;
  referrerKey: string;
  teacherRecordKey?: string;
  studentName: string;
  grade: string;
  referralSource: 'teacher_concern' | 'parent_written_request';
  category: 'academic' | 'behavioral' | 'attendance' | 'social-emotional' | 'speech' | 'ot' | 'other';
  status: 'pending' | 'active' | 'initial' | 'closed';
  reason: string;
  softDeleted?: boolean;
  /** Days before seed date the request was received (Lane B only). */
  requestReceivedDaysAgo?: number;
  withCase?: boolean;
  notes?: string[];
  actionItem?: { description: string; assigneeKey: string };
  statusHistory?: string[];
}

export const CARE_REFERRALS: CareSpec[] = [
  {
    key: 'care-pending', schoolId: WILLOW, referrerKey: 'nora', teacherRecordKey: 'login:nora',
    studentName: 'Maya Torres-Sim', grade: '3', referralSource: 'teacher_concern',
    category: 'academic', status: 'pending',
    reason: 'Reading fluency well below grade level despite small-group support; requesting CARE discussion.',
  },
  {
    key: 'care-active', schoolId: WILLOW, referrerKey: 'rachel',
    studentName: 'Leo Nguyen-Sim', grade: '2', referralSource: 'teacher_concern',
    category: 'social-emotional', status: 'active', withCase: true,
    reason: 'Escalating classroom shutdowns during transitions; team discussion needed.',
    notes: [
      'Initial CARE meeting held; agreed on a 4-week check-in cycle with counselor input.',
      'Teacher reports mild improvement with visual schedule; continue monitoring.',
    ],
    actionItem: { description: 'Set up daily visual schedule and model transitions for two weeks.', assigneeKey: 'rachel' },
    statusHistory: ['pending', 'active'],
  },
  {
    key: 'care-laneb', schoolId: WILLOW, referrerKey: 'priya',
    studentName: 'Ava Garcia-Sim', grade: '1', referralSource: 'parent_written_request',
    category: 'speech', status: 'initial', withCase: true, requestReceivedDaysAgo: 5,
    reason: 'Parent submitted a written request for special education assessment (articulation concerns).',
    statusHistory: ['initial'],
  },
  {
    key: 'care-closed', schoolId: CEDAR, referrerKey: 'fatima', teacherRecordKey: 'login:fatima',
    studentName: 'Noah Patel-Sim', grade: '7', referralSource: 'teacher_concern',
    category: 'behavioral', status: 'closed', withCase: true,
    reason: 'Repeated conflicts during passing periods; CARE cycle completed with behavior contract.',
    notes: ['Behavior contract in place; six-week review showed sustained improvement. Closing.'],
    statusHistory: ['pending', 'active', 'closed'],
  },
  {
    key: 'care-softdeleted', schoolId: WILLOW, referrerKey: 'nora', teacherRecordKey: 'login:nora',
    studentName: 'Mia Silva-Sim', grade: '3', referralSource: 'teacher_concern',
    category: 'other', status: 'pending', softDeleted: true,
    reason: 'Submitted in error (duplicate of an existing referral).',
  },
  {
    key: 'care-redwood', schoolId: REDWOOD, referrerKey: 'naomi',
    studentName: 'Eli Okafor-Sim', grade: '10', referralSource: 'teacher_concern',
    category: 'attendance', status: 'pending',
    reason: 'Chronic absenteeism (8 absences in 4 weeks); requesting CARE review of supports.',
  },
];

export function careReferralId(key: string): string {
  return simUuid(`care:referral:${key}`);
}
export function careCaseId(key: string): string {
  return simUuid(`care:case:${key}`);
}
export function careNoteId(key: string, index: number): string {
  return simUuid(`care:note:${key}:${index}`);
}
export function careActionItemId(key: string): string {
  return simUuid(`care:action:${key}`);
}
export function careHistoryId(key: string, status: string): string {
  return simUuid(`care:history:${key}:${status}`);
}

// ---------------------------------------------------------------------------
// Declared tables (invariant 4): what seed/teardown/verify may touch
// ---------------------------------------------------------------------------

/** Tables seed.ts plants rows in (all rows manifest-keyed). Teardown order = reverse-ish, children first. */
export const SEEDED_TABLES = [
  'districts', 'schools', 'profiles', 'admin_permissions', 'provider_schools',
  'user_site_schedules', 'teachers', 'students', 'student_details',
  'bell_schedules', 'school_hours', 'special_activities',
  'session_groups', 'schedule_sessions',
  'attendance', 'care_referrals', 'care_cases', 'care_meeting_notes',
  'care_action_items', 'care_case_status_history',
] as const;

/**
 * Tables the app itself writes during sim verification runs; teardown sweeps
 * them by FK-equality to sim identities (invariant 2). Grows with the test
 * surface — adding a feature's tables here is part of that feature's
 * verification setup (spec §7).
 */
export const SWEPT_TABLES: { table: string; column: string; identity: 'user' | 'student' | 'school' }[] = [
  { table: 'sign_in_logs', column: 'user_id', identity: 'user' },
  { table: 'todos', column: 'user_id', identity: 'user' },
  { table: 'lessons', column: 'provider_id', identity: 'user' },
  { table: 'worksheets', column: 'student_id', identity: 'student' },
  // IEP meetings (SPE-203/206/208): verification runs create these through
  // the app. Deleting iep_meetings cascades attendees + confirmation tokens;
  // site_meeting_rules has NO cascade path from schools, so its sweep is what
  // lets teardown's school delete succeed.
  { table: 'iep_meetings', column: 'student_id', identity: 'student' },
  { table: 'student_parent_contacts', column: 'student_id', identity: 'student' },
  { table: 'teacher_availability_prefs', column: 'profile_id', identity: 'user' },
  { table: 'site_meeting_rules', column: 'school_id', identity: 'school' },
];

/**
 * Every OTHER public relation, declared so verify's coverage check can prove
 * the manifest accounts for the entire exposed schema (spec §7). Features
 * under test create their own rows through the app (and their tables join
 * SWEPT_TABLES before the run); global/infra tables are never sim-owned.
 * A table added by a new migration MUST be classified here (or in
 * SEEDED/SWEPT) as part of that feature's work — sim:verify fails until it is.
 */
export const DECLARED_UNSEEDED_TABLES: string[] = [
  // Feature-under-test surfaces — verification runs create these live, via the app:
  'conversations', 'conversation_participants', 'conversation_read_state', 'messages',
  'provider_availability',
  // Children of swept IEP tables — cleaned by ON DELETE CASCADE from
  // iep_meetings / student_parent_contacts, so no direct sweep key needed:
  'iep_meeting_attendees', 'parent_confirmation_tokens',
  // AI-generated content (AI gated off; generation costs real tokens):
  'exit_tickets', 'exit_ticket_results', 'progress_checks', 'progress_check_results',
  'saved_worksheets', 'worksheet_submissions', 'lesson_adjustment_queue',
  'lesson_performance_history',
  // Progress/assessment surfaces:
  'iep_goal_progress', 'manual_goal_progress', 'student_assessments',
  'student_performance_metrics', 'assessment_types', 'progress_notifications',
  // Staffing / master-schedule (site-admin surface; seed when a feature needs it):
  'staff', 'staff_hours', 'staff_teacher_assignments', 'instruction_schedules',
  'yard_duty_assignments', 'yard_duty_zones', 'rotation_groups',
  'rotation_group_members', 'rotation_activity_pairs', 'rotation_week_assignments',
  'activity_type_availability', 'activated_school_years', 'school_year_config',
  'holidays',
  // Personal / auxiliary:
  'documents', 'curriculum_tracking', 'calendar_connections', 'calendar_events',
  'api_keys', 'teams', 'team_members', 'material_constraints',
  // Global / infra — never sim-owned:
  'states', 'landing_signups', 'analytics_events', 'audit_logs',
  'api_rate_limits', 'upload_rate_limits',
  // Signup-trigger debug log — swept bespoke in teardown (metadata-tagged):
  'debug_signup_log',
  // Read-only views (PostgREST exposes them alongside base tables):
  'cross_provider_visibility', 'shared_students', 'unmatched_student_teachers',
  'upload_analytics_summary',
];
