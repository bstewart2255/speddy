/**
 * SPE-396 · Aeries connection setup — URL normalization and per-area diagnostics.
 *
 * These tests carry more weight than usual: `demo.aeries.net` is blocked by
 * this sandbox's network policy, so the diagnostics cannot currently be
 * exercised against a real Aeries instance. Everything asserted here is
 * therefore pinned against the failure shapes the client actually produces
 * (`AeriesApiError` with a real HTTP status), not against a hand-waved mock —
 * and the gap is stated plainly on the PR rather than implied away.
 *
 * The two properties worth the most:
 *   - 401 and 403 must NOT produce the same advice. One means the certificate
 *     is wrong, the other means a checkbox was never ticked. Collapsing them
 *     is what causes the support round-trips this feature exists to remove.
 *   - no probe may surface a student name, an ID, or the certificate.
 */
import { AeriesApiError } from '@/lib/integrations/aeries';

// The setup module now resolves the host before probing (SSRF guard). Tests of
// the DIAGNOSTICS must not depend on DNS, so the resolved check is stubbed to
// pass here; ssrf-guard.test.ts covers the guard itself.
jest.mock('@/lib/sis/ssrf-guard', () => ({
  ...jest.requireActual('@/lib/sis/ssrf-guard'),
  assertSafeAeriesUrl: jest.fn().mockResolvedValue(undefined),
}));

const mockGetSchools = jest.fn();
const mockGetSchoolStudents = jest.fn();
const mockGetSchoolTeachers = jest.fn();
const mockGetStudentPrograms = jest.fn();
let mockClientConfig: { baseUrl: string; certificate: string } | null = null;

jest.mock('@/lib/integrations/aeries', () => {
  const actual = jest.requireActual('@/lib/integrations/aeries');
  return {
    ...actual,
    AeriesClient: class {
      constructor(config: { baseUrl: string; certificate: string }) {
        mockClientConfig = config;
      }
      getSchools = (...a: unknown[]) => mockGetSchools(...a);
      getSchoolStudents = (...a: unknown[]) => mockGetSchoolStudents(...a);
      getSchoolTeachers = (...a: unknown[]) => mockGetSchoolTeachers(...a);
      getStudentPrograms = (...a: unknown[]) => mockGetStudentPrograms(...a);
    },
  };
});

import {
  AERIES_API_PATH,
  normalizeAeriesBaseUrl,
  runAeriesConnectionTest,
  toStoredTestResult,
} from '@/lib/sis/aeries-setup';

const CERT = '477abe9e7d27439681d62f4e0de1f5e1';
const grantAll = () => {
  mockGetSchools.mockResolvedValue([{ SchoolCode: 1, Name: 'Sim High' }]);
  mockGetSchoolStudents.mockResolvedValue([{ StudentID: 1 }]);
  mockGetSchoolTeachers.mockResolvedValue([{ TeacherNumber: 1 }]);
  mockGetStudentPrograms.mockResolvedValue([{ StudentID: 1, ProgramCode: '144' }]);
};
const run = () => runAeriesConnectionTest({ baseUrl: 'https://x.aeries.net' + AERIES_API_PATH, certificate: CERT });
const area = (r: Awaited<ReturnType<typeof run>>, key: string) => r.areas.find((a) => a.key === key)!;

beforeEach(() => {
  jest.clearAllMocks();
  mockClientConfig = null;
});

describe('normalizeAeriesBaseUrl', () => {
  // Every one of these is a shape a district administrator will actually
  // paste, because it is what their browser was showing them.
  it.each([
    ['https://demo.aeries.net', 'bare host'],
    ['https://demo.aeries.net/', 'trailing slash'],
    ['https://demo.aeries.net/admin', 'the admin page they were on'],
    ['https://demo.aeries.net/admin/', 'admin with a slash'],
    ['https://demo.aeries.net/aeries/api/v5', 'already correct'],
    ['demo.aeries.net', 'no scheme at all'],
    ['  https://demo.aeries.net/admin  ', 'padded by the copy/paste'],
  ])('normalizes %s (%s)', (input) => {
    expect(normalizeAeriesBaseUrl(input)).toBe('https://demo.aeries.net/aeries/api/v5');
  });

  it('never doubles the api path when one is already present', () => {
    expect(normalizeAeriesBaseUrl('https://d.aeries.net/aeries/api/v5')).not.toContain(
      '/aeries/api/v5/aeries',
    );
  });

  it('preserves a non-default port', () => {
    expect(normalizeAeriesBaseUrl('https://sis.district.org:8443/admin')).toBe(
      'https://sis.district.org:8443/aeries/api/v5',
    );
  });

  it('refuses http rather than silently upgrading it', () => {
    // Silently upgrading would hide that the district gave us a cleartext
    // address; the certificate would ride that URL on every request.
    expect(() => normalizeAeriesBaseUrl('http://demo.aeries.net')).toThrow(/https:\/\//);
  });

  it('refuses empty input with an instruction, not a stack trace', () => {
    expect(() => normalizeAeriesBaseUrl('   ')).toThrow(/Enter your district/);
  });

  it('refuses something that cannot be a URL', () => {
    expect(() => normalizeAeriesBaseUrl('not a url at all')).toThrow(/look like/);
  });
});

describe('runAeriesConnectionTest', () => {
  it('reports every area granted on a healthy connection', async () => {
    grantAll();
    const report = await run();

    expect(report.ok).toBe(true);
    expect(report.summary).toMatch(/ready/i);
    for (const key of ['connection', 'schools', 'students', 'teachers', 'programs']) {
      expect(area(report, key).status).toBe('ok');
    }
  });

  it('passes the supplied credential to the client, not the env default', async () => {
    grantAll();
    await run();
    expect(mockClientConfig).toEqual({
      baseUrl: `https://x.aeries.net${AERIES_API_PATH}`,
      certificate: CERT,
    });
  });

  describe('401 vs 403 — the distinction the whole feature turns on', () => {
    it('401 blames the certificate and says where to re-copy it', async () => {
      mockGetSchools.mockRejectedValue(new AeriesApiError('unauthorized', 401, 'schools'));
      const report = await run();

      expect(report.ok).toBe(false);
      expect(area(report, 'connection').message).toMatch(/certificate/i);
      expect(area(report, 'connection').message).toMatch(/API Security/);
      // Must NOT tell them to tick a permission box — that would send them to
      // the wrong screen entirely.
      expect(area(report, 'connection').message).not.toMatch(/tick the read-only box/);
    });

    it('403 names the exact checkbox, and does not blame the certificate', async () => {
      grantAll();
      mockGetStudentPrograms.mockRejectedValue(new AeriesApiError('forbidden', 403, 'programs'));
      const report = await run();

      const programs = area(report, 'programs');
      expect(programs.status).toBe('denied');
      expect(programs.message).toContain('Student Programs');
      expect(programs.message).toMatch(/read-only box/);
      expect(programs.message).not.toMatch(/certificate/i);
    });

    it('403 on Schools reports a denial, not an unreachable instance', async () => {
      // The district granted the certificate but never ticked Schools. Nothing
      // downstream can be probed, but the cause is a checkbox, not the network.
      mockGetSchools.mockRejectedValue(new AeriesApiError('forbidden', 403, 'schools'));
      const report = await run();

      expect(area(report, 'schools').status).toBe('denied');
      expect(area(report, 'schools').message).toContain('Schools');
      expect(report.summary).toMatch(/Could not connect/i);
    });
  });

  it('calls out a lone Student Programs denial as the consequential one', async () => {
    // The half-success that matters: everything looks connected, but no
    // special-education data will ever arrive. It must not read as "fine".
    grantAll();
    mockGetStudentPrograms.mockRejectedValue(new AeriesApiError('forbidden', 403, 'programs'));
    const report = await run();

    expect(report.ok).toBe(false);
    expect(report.summary).toMatch(/special education/i);
  });

  it('distinguishes a wrong address from a permission problem', async () => {
    mockGetSchools.mockRejectedValue(new AeriesApiError('not found', 404, 'schools'));
    const report = await run();
    expect(area(report, 'connection').message).toMatch(/address/i);
    expect(area(report, 'connection').message).not.toMatch(/read-only box/);
  });

  it('reports a network failure as unreachable rather than as a permission denial', async () => {
    mockGetSchools.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
    const report = await run();
    expect(area(report, 'connection').message).toMatch(/Could not reach/i);
  });

  it('reports a timeout as a timeout', async () => {
    mockGetSchools.mockRejectedValue(new AeriesApiError('timed out', 408, 'schools'));
    const report = await run();
    expect(area(report, 'connection').message).toMatch(/did not respond in time/i);
  });

  it('marks downstream areas untested when the connection fails, rather than guessing', async () => {
    mockGetSchools.mockRejectedValue(new AeriesApiError('unauthorized', 401, 'schools'));
    const report = await run();

    for (const key of ['students', 'teachers', 'programs']) {
      expect(area(report, key).message).toMatch(/Not checked/);
      // 'untested', not 'error' — the UI colours by status, and three red
      // permission failures for areas nobody probed sends the district off to
      // fix checkboxes that may already be correct.
      expect(area(report, key).status).toBe('untested');
    }
    // And it must not have called them — probing with a cert Aeries just
    // rejected produces three more misleading failures.
    expect(mockGetSchoolStudents).not.toHaveBeenCalled();
    expect(mockGetSchoolTeachers).not.toHaveBeenCalled();
    expect(mockGetStudentPrograms).not.toHaveBeenCalled();
  });

  it('handles an authorized connection that returns no schools', async () => {
    mockGetSchools.mockResolvedValue([]);
    const report = await run();
    expect(report.ok).toBe(false);
    expect(report.summary).toMatch(/no schools/i);
  });

  describe('aggregate-only — the tech admin has no right to student data', () => {
    it('requests one non-identifying field and a single row per probe', async () => {
      grantAll();
      await run();

      const studentOpts = mockGetSchoolStudents.mock.calls[0][1];
      expect(studentOpts.fields).toEqual(['StudentID']);
      expect(studentOpts.endingRecord).toBe(1);

      const teacherOpts = mockGetSchoolTeachers.mock.calls[0][1];
      expect(teacherOpts.endingRecord).toBe(1);

      // ProgramCode only: asking for StudentID too would pull an identifiable
      // program-membership record into memory on an aggregate-only flow.
      const programOpts = mockGetStudentPrograms.mock.calls[0][3];
      expect(programOpts.fields).toEqual(['ProgramCode']);
      expect(programOpts.fields).not.toContain('StudentID');
    });

    it('never surfaces a student name or the certificate in any message', async () => {
      mockGetSchools.mockResolvedValue([{ SchoolCode: 1, Name: 'Sim High' }]);
      // A hostile-shaped payload: if any probe echoed records into its output,
      // this name and id would appear in the report.
      mockGetSchoolStudents.mockResolvedValue([
        { StudentID: 98765, FirstName: 'Jordan', LastName: 'Rivera' },
      ]);
      mockGetSchoolTeachers.mockResolvedValue([{ TeacherNumber: 7, LastName: 'Nakamura' }]);
      mockGetStudentPrograms.mockResolvedValue([{ StudentID: 98765, ProgramCode: '144' }]);

      const blob = JSON.stringify(await run());
      for (const leak of ['Jordan', 'Rivera', 'Nakamura', '98765', CERT]) {
        expect(blob).not.toContain(leak);
      }
    });
  });
});

describe('toStoredTestResult', () => {
  it('keeps outcomes and drops the counts', async () => {
    grantAll();
    const stored = toStoredTestResult(await run());
    // Counts are aggregate, but the connection log has no need to remember how
    // many students a district has.
    expect(JSON.stringify(stored)).not.toMatch(/count/);
    expect(stored.area).toBe('all');
  });

  it('names the failing areas', async () => {
    grantAll();
    mockGetStudentPrograms.mockRejectedValue(new AeriesApiError('forbidden', 403, 'programs'));
    const stored = toStoredTestResult(await run());
    expect(stored.area).toContain('Student Programs');
  });

  it('never carries a credential into the stored result', async () => {
    mockGetSchools.mockRejectedValue(new AeriesApiError(`bad cert ${CERT}`, 401, 'schools'));
    const stored = toStoredTestResult(await run());
    // AeriesApiError messages can carry the submitted cert; nothing may copy
    // one into a column the district's staff can read.
    expect(JSON.stringify(stored)).not.toContain(CERT);
  });
});
