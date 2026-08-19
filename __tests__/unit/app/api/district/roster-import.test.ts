/**
 * SPE-447 · POST /api/district/roster-import — the district admin's Preview →
 * Publish for the SEIS roster, and what a refused caller does NOT set in motion.
 *
 * Same posture as the link-sync suite (SPE-540): the load-bearing assertions
 * are that nothing reads a district's children and nothing writes a child
 * record unless a district admin, in their own district, asked. `district_tech`
 * is refused on purpose — this surface serves student PII across every school
 * in the district, well outside that role's integrations-only line (SPE-393).
 *
 * The other half is the count binding: publishing writes exactly the plan the
 * admin reviewed, or it writes nothing.
 *
 * All data is fictional.
 */
import { NextRequest } from 'next/server';

const ADMIN_ID = '55555555-5555-4555-8555-555555555555';
const DISTRICT_ID = '0618990';

let currentUserId: string | null = ADMIN_ID;
/** Whether the grant re-check finds a district_admin row for a tech-role caller. */
let holdsAdminGrant = false;

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () =>
        currentUserId
          ? { data: { user: { id: currentUserId } }, error: null }
          : { data: { user: null }, error: { message: 'no session' } },
    },
  }),
  createServiceClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.limit = () => q;
      q.maybeSingle = () =>
        Promise.resolve({ data: holdsAdminGrant ? { id: 'grant-1' } : null, error: null });
      return q;
    },
  }),
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
}));

jest.mock('@/lib/logger', () => {
  const noop = () => {};
  const fake = { info: noop, warn: noop, error: noop, debug: noop, child: () => fake };
  return { logger: fake };
});

const mockResolveCaller = jest.fn();
jest.mock('@/lib/api/district-sis-caller', () => ({
  resolveDistrictSisCaller: (...a: unknown[]) => mockResolveCaller(...a),
}));

// The two functions that reach the database: one reads every child in the
// district, one writes child records.
const mockLoad = jest.fn();
const mockApply = jest.fn();
jest.mock('@/lib/district-roster/roster-import', () => ({
  ...jest.requireActual('@/lib/district-roster/roster-import'),
  loadDistrictRosterContext: (...a: unknown[]) => mockLoad(...a),
  applyDistrictRosterPlan: (...a: unknown[]) => mockApply(...a),
}));

import { POST } from '@/app/api/district/roster-import/route';

const GOALS_HEADER =
  'SEIS ID,SSID,District ID,Last Name,First Name,Birthdate,Grade,School of Attendance,' +
  'District of Service,Case Manager,IEP Date,Eligibility Status,Area Of Need,Annual Goal #,' +
  'Baseline,Goal,Purpose(s) of Goal,Standard,Person Responsible';

const GOALS_CSV =
  `${GOALS_HEADER}\n` +
  '900,251,100001,Alvarez,Ana,01/05/2016,1,Rodeo Hills Elementary,JSUSD,C Mayer,' +
  '02/10/2026,SLD,Reading,Reading,At grade 1,' +
  '"Given a passage, the student will read 60 words per minute with 90% accuracy.",' +
  'Benefit,CCSS,Resource Specialist';

/** One school, no children yet: the goals file plans exactly one create. */
const CONTEXT = {
  schools: [{ id: 'sch-rodeo', name: 'Rodeo Hills Elementary' }],
  existingChildren: [],
};

/**
 * Minimal multipart stand-in. A real jsdom FormData mangles the File into a
 * value with no `.arrayBuffer()`, and a real streaming body never resolves
 * under jsdom's fetch — so hand the route the same `.get()` shim the
 * import-students suite uses. `body` is absent, which is what makes the capped
 * read fall through to `formData()` directly.
 */
const csvFile = (name: string, content: string): File =>
  ({
    name,
    type: 'text/csv',
    size: content.length,
    arrayBuffer: async () => new TextEncoder().encode(content).buffer,
  }) as unknown as File;

const call = (fields: Record<string, string>, csv: string | null = GOALS_CSV) => {
  const values: Record<string, unknown> = { ...fields };
  if (csv !== null) values.goalsFile = csvFile('goals.csv', csv);

  const request = {
    url: 'http://localhost/api/district/roster-import',
    method: 'POST',
    nextUrl: { pathname: '/api/district/roster-import' },
    headers: new Headers(),
    formData: async () => ({ get: (key: string) => values[key] ?? null }),
  } as unknown as NextRequest;

  return POST(request, { params: Promise.resolve({}) });
};

const nothingHappened = () => {
  expect(mockLoad).not.toHaveBeenCalled();
  expect(mockApply).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.clearAllMocks();
  currentUserId = ADMIN_ID;
  holdsAdminGrant = false;
  mockResolveCaller.mockResolvedValue({ ok: true, role: 'district_admin', districtId: DISTRICT_ID });
  mockLoad.mockResolvedValue(CONTEXT);
  mockApply.mockResolvedValue({ created: 1, updated: 0 });
});

describe('the gate', () => {
  it('refuses an unauthenticated caller, reading nothing', async () => {
    currentUserId = null;
    const res = await call({ mode: 'preview' });
    expect(res.status).toBe(401);
    nothingHappened();
  });

  it('refuses a caller with no district grant at all, reading nothing', async () => {
    mockResolveCaller.mockResolvedValue({ ok: false, denied: 'no-grant' });
    const res = await call({ mode: 'preview' });
    expect(res.status).toBe(403);
    nothingHappened();
  });

  it('refuses district_tech — a district roster of students is beyond its line', async () => {
    mockResolveCaller.mockResolvedValue({ ok: true, role: 'district_tech', districtId: DISTRICT_ID });
    const res = await call({ mode: 'publish', expectedChanges: '1' });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/district roster is for district admins/);
    nothingHappened();
  });

  it('admits a dual-role caller whose grants include district_admin', async () => {
    mockResolveCaller.mockResolvedValue({ ok: true, role: 'district_tech', districtId: DISTRICT_ID });
    holdsAdminGrant = true;
    const res = await call({ mode: 'preview' });
    expect(res.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith(DISTRICT_ID);
  });

  it('imports into the caller OWN district — the request cannot name one', async () => {
    const res = await call({ mode: 'preview', districtId: '9999999' });
    expect(res.status).toBe(200);
    expect(mockLoad).toHaveBeenCalledWith(DISTRICT_ID);
    expect(mockApply).not.toHaveBeenCalled();
  });
});

describe('preview', () => {
  it('returns the district-wide plan and writes nothing', async () => {
    const res = await call({ mode: 'preview' });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.mode).toBe('preview');
    expect(body.plan.counts).toMatchObject({ creates: 1, updates: 0, inFiles: 1 });
    expect(body.plan.children[0].fields).toMatchObject({
      firstName: 'Ana',
      districtStudentId: '100001',
      schoolId: 'sch-rodeo',
    });
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('refuses a file it cannot identify as the Student Goals report', async () => {
    const res = await call({ mode: 'preview' }, 'First Name,Last Name,Grade\nAna,Alvarez,1');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/does not look like the SEIS Student Goals report/);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('refuses an upload with no files', async () => {
    const res = await call({ mode: 'preview' }, null);
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('refuses a text value posted under a file field, rather than erroring', async () => {
    const res = await call({ mode: 'preview', goalsFile: 'not-a-file' }, null);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/was not sent as a file/);
    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe('publish', () => {
  it('writes the plan the admin reviewed', async () => {
    const res = await call({ mode: 'publish', expectedChanges: '1' });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.mode).toBe('publish');
    expect(body.written).toEqual({ created: 1, updated: 0 });
    expect(mockApply).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: ADMIN_ID, districtId: DISTRICT_ID }),
    );
  });

  it('refuses when the plan moved since the preview — 409, nothing written', async () => {
    const res = await call({ mode: 'publish', expectedChanges: '7' });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/changed since the preview/);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('refuses a publish with no reviewed count at all', async () => {
    const res = await call({ mode: 'publish' });
    expect(res.status).toBe(400);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('answers honestly when the write fails partway', async () => {
    mockApply.mockRejectedValue(new Error('children insert failed: duplicate key on ux_...'));
    const res = await call({ mode: 'publish', expectedChanges: '1' });

    expect(res.status).toBe(500);
    const { error } = await res.json();
    expect(error).toMatch(/some students may already be saved/);
    // The database's own message never reaches the admin.
    expect(error).not.toMatch(/duplicate key|ux_/);
  });

  it('answers 502 without writing when the district records cannot be read', async () => {
    mockLoad.mockRejectedValue(new Error('Could not load this district\'s children: timeout'));
    const res = await call({ mode: 'publish', expectedChanges: '1' });

    expect(res.status).toBe(502);
    expect((await res.json()).error).not.toMatch(/timeout|children/);
    expect(mockApply).not.toHaveBeenCalled();
  });
});
