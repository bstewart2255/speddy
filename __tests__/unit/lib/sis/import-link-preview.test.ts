/**
 * SPE-546 · `previewTeacherLinks` — the review screen's "which teachers will
 * this student get?" matcher.
 *
 * The load-bearing property: this is a PREVIEW of what the link sync will do
 * — same identifier dialect (shared helper), same live-classes-only join,
 * same refusal to guess between records — so a student the preview shows
 * matched can never come out differently when the SPE-545 sync runs.
 */
import {
  previewTeacherLinks,
  type LinkPreviewInput,
} from '@/lib/sis/import-link-preview';

jest.mock('@/lib/logger', () => {
  const fake: Record<string, unknown> = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  fake.child = () => fake;
  return { logger: fake };
});

function input(overrides: Partial<LinkPreviewInput> = {}): LinkPreviewInput {
  return {
    feedStudents: [{ sourcedId: 'sis-stu-1', identifier: '33_STU_DS-100' }],
    feedEnrollments: [
      { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
      { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
    ],
    feedClasses: [{ sourcedId: 'cls-1', title: 'Algebra I', periods: ['3'] }],
    schoolTeachers: [{ sisId: 'sis-tch-1', name: 'EBONIE BARNETT' }],
    ...overrides,
  };
}

describe('the matching spine, mirrored', () => {
  it('resolves an Aeries compound identifier to named teachers with class labels', () => {
    const entries = previewTeacherLinks(input(), ['DS-100']);
    expect(entries['DS-100']).toEqual({
      status: 'matched',
      teachers: [{ name: 'EBONIE BARNETT', subject: 'Algebra I', period: '3' }],
      missingFromDirectory: 0,
    });
  });

  it('matches a bare identifier verbatim too', () => {
    const entries = previewTeacherLinks(
      input({ feedStudents: [{ sourcedId: 'sis-stu-1', identifier: 'DS-100' }] }),
      ['DS-100'],
    );
    expect(entries['DS-100'].status).toBe('matched');
  });

  it('an unknown number is not-found — the fix-it-before-importing signal', () => {
    const entries = previewTeacherLinks(input(), ['DS-999']);
    expect(entries['DS-999']).toEqual({ status: 'not-found' });
  });

  it('two SIS records answering one number refuse, exactly like the sync', () => {
    const entries = previewTeacherLinks(
      input({
        feedStudents: [
          { sourcedId: 'sis-stu-1', identifier: '33_STU_DS-100' },
          { sourcedId: 'sis-stu-2', identifier: '11_STU_DS-100' },
        ],
      }),
      ['DS-100'],
    );
    expect(entries['DS-100']).toEqual({ status: 'multiple-records' });
  });

  it('a paging echo of one record is NOT a multiple-records refusal', () => {
    const entries = previewTeacherLinks(
      input({
        feedStudents: [
          { sourcedId: 'sis-stu-1', identifier: '33_STU_DS-100' },
          { sourcedId: 'sis-stu-1', identifier: '33_STU_DS-100' },
        ],
      }),
      ['DS-100'],
    );
    expect(entries['DS-100'].status).toBe('matched');
  });

  it('roster teachers missing from the school directory say so, never a silent empty', () => {
    const entries = previewTeacherLinks(input({ schoolTeachers: [] }), ['DS-100']);
    expect(entries['DS-100']).toEqual({ status: 'teachers-not-in-directory' });
  });

  it('a matched student with genuinely no roster teachers reports an empty set', () => {
    const entries = previewTeacherLinks(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
        ],
      }),
      ['DS-100'],
    );
    expect(entries['DS-100']).toEqual({ status: 'matched', teachers: [], missingFromDirectory: 0 });
  });

  it('a PARTIALLY synced directory is reported, never a complete-looking list', () => {
    // One roster teacher resolves, one has no directory row — the count says
    // so, so the shown list cannot masquerade as the whole set (PR #896).
    const entries = previewTeacherLinks(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
          { userSourcedId: 'sis-tch-unkeyed', classSourcedId: 'cls-1', role: 'teacher' },
        ],
      }),
      ['DS-100'],
    );
    expect(entries['DS-100']).toEqual({
      status: 'matched',
      teachers: [{ name: 'EBONIE BARNETT', subject: 'Algebra I', period: '3' }],
      missingFromDirectory: 1,
    });
  });

  it('two directory teachers sharing a display name stay TWO rows — the sync writes two links', () => {
    const entries = previewTeacherLinks(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
          { userSourcedId: 'sis-tch-2', classSourcedId: 'cls-1', role: 'teacher' },
        ],
        schoolTeachers: [
          { sisId: 'sis-tch-1', name: 'MARIA GARCIA' },
          { sisId: 'sis-tch-2', name: 'MARIA GARCIA' },
        ],
      }),
      ['DS-100'],
    );
    const entry = entries['DS-100'];
    if (entry.status !== 'matched') throw new Error('expected matched');
    expect(entry.teachers).toHaveLength(2);
  });

  it('a file-controlled id like "constructor" round-trips as a real entry', () => {
    // Entries are built prototype-safe: an Object.prototype member name must
    // come back as an OWN not-found entry, not vanish or resolve to an
    // inherited function (PR #896 review).
    const entries = previewTeacherLinks(input(), ['constructor']);
    expect(Object.hasOwn(entries, 'constructor')).toBe(true);
    expect(entries['constructor']).toEqual({ status: 'not-found' });
  });

  it('an enrollment naming a dead class contributes nothing', () => {
    const entries = previewTeacherLinks(
      input({
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-dead', role: 'student' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-dead', role: 'teacher' },
        ],
      }),
      ['DS-100'],
    );
    expect(entries['DS-100']).toEqual({ status: 'matched', teachers: [], missingFromDirectory: 0 });
  });

  it('merges shared classes per teacher with deterministic labels, teachers sorted by name', () => {
    const entries = previewTeacherLinks(
      input({
        feedClasses: [
          { sourcedId: 'cls-1', title: 'Science', periods: ['10'] },
          { sourcedId: 'cls-2', title: 'Algebra I', periods: ['2'] },
        ],
        feedEnrollments: [
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-1', role: 'student' },
          { userSourcedId: 'sis-stu-1', classSourcedId: 'cls-2', role: 'student' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-1', role: 'teacher' },
          { userSourcedId: 'sis-tch-1', classSourcedId: 'cls-2', role: 'teacher' },
          { userSourcedId: 'sis-tch-2', classSourcedId: 'cls-2', role: 'teacher' },
        ],
        schoolTeachers: [
          { sisId: 'sis-tch-1', name: 'EBONIE BARNETT' },
          { sisId: 'sis-tch-2', name: 'FELIX CADIZ' },
        ],
      }),
      ['DS-100'],
    );
    expect(entries['DS-100']).toEqual({
      status: 'matched',
      teachers: [
        { name: 'EBONIE BARNETT', subject: 'Algebra I / Science', period: '2/10' },
        { name: 'FELIX CADIZ', subject: 'Algebra I', period: '2' },
      ],
      missingFromDirectory: 0,
    });
  });

  it('asked ids are trimmed and deduped; blanks are skipped', () => {
    const entries = previewTeacherLinks(input(), [' DS-100 ', 'DS-100', '  ']);
    expect(Object.keys(entries)).toEqual(['DS-100']);
  });
});
