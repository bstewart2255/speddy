/**
 * SPE-436 · the directory module CALLS the real SSRF guard (the SPE-396
 * lesson: a guard with tests of its internals and no test that anything calls
 * it is deletable with a green suite). DNS is mocked under the real guard;
 * the observable consequence is that no client is ever constructed.
 */
const mockLookup = jest.fn();
jest.mock('dns/promises', () => ({ lookup: (...a: unknown[]) => mockLookup(...a) }));

const constructed: string[] = [];
jest.mock('@/lib/integrations/oneroster', () => {
  const actual = jest.requireActual('@/lib/integrations/oneroster');
  return {
    ...actual,
    OneRosterClient: class {
      constructor(config: { tokenUrl: string }) {
        constructed.push(config.tokenUrl);
      }
      getSchools = jest.fn().mockResolvedValue([]);
      getTeachers = jest.fn().mockResolvedValue([]);
      getStudents = jest.fn().mockResolvedValue([]);
      getClasses = jest.fn().mockResolvedValue([]);
    },
  };
});

import { fetchDirectoryPage } from '@/lib/sis/oneroster-directory';

beforeEach(() => {
  jest.clearAllMocks();
  constructed.length = 0;
});

const PARAMS = {
  baseUrl: 'https://data.example.com/admin',
  tokenUrl: 'https://data.example.com/admin/token',
  clientId: 'id',
  clientSecret: 'secret',
  area: 'teachers' as const,
};

it('refuses a privately-resolving address before any client exists', async () => {
  mockLookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

  await expect(fetchDirectoryPage(PARAMS)).rejects.toThrow();
  expect(constructed).toHaveLength(0);
});

it('proceeds on public resolution, using the stored token address verbatim', async () => {
  mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);

  const page = await fetchDirectoryPage(PARAMS);
  expect(constructed).toEqual(['https://data.example.com/admin/token']);
  expect(page.rows).toEqual([]);
});

it('derives the first candidate when no token address is stored — and still guards it', async () => {
  mockLookup.mockResolvedValue([{ address: '104.16.0.1', family: 4 }]);

  await fetchDirectoryPage({ ...PARAMS, tokenUrl: null });
  expect(constructed).toEqual(['https://data.example.com/admin/token']);
  // "Still guards it" means the derived address went through DNS resolution
  // too — one lookup per URL (CodeRabbit, PR #830).
  expect(mockLookup).toHaveBeenCalledTimes(2);
});
