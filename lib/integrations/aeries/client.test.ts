import { AeriesClient, AeriesApiError } from './client';
import type { AeriesConnectionConfig } from './config';

const config: AeriesConnectionConfig = {
  baseUrl: 'https://demo.aeries.net/aeries/api/v5',
  certificate: 'test-cert-value',
};

function mockFetchOnce(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fetchMock = jest.fn().mockResolvedValue({
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('AeriesClient request building', () => {
  it('sends the AERIES-CERT header and JSON Accept, no-store', async () => {
    const fetchMock = mockFetchOnce([{ SchoolCode: 1 }]);
    const client = new AeriesClient(config);

    await client.getSchools();

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://demo.aeries.net/aeries/api/v5/schools');
    expect(opts.headers['AERIES-CERT']).toBe('test-cert-value');
    expect(opts.headers.Accept).toBe('application/json');
    expect(opts.cache).toBe('no-store');
  });

  it('encodes fields, pagination and dateLastModified params', async () => {
    const fetchMock = mockFetchOnce([]);
    const client = new AeriesClient(config);

    await client.get('schools/1/teachers', {
      fields: ['FirstName', 'LastName'],
      startingRecord: 1,
      endingRecord: 50,
      dateLastModified: '2026-01-01',
    });

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/aeries/api/v5/schools/1/teachers');
    expect(url.searchParams.get('fields')).toBe('FirstName,LastName');
    expect(url.searchParams.get('StartingRecord')).toBe('1');
    expect(url.searchParams.get('EndingRecord')).toBe('50');
    expect(url.searchParams.get('dateLastModified')).toBe('2026-01-01');
  });

  it('passes the program code query param through', async () => {
    const fetchMock = mockFetchOnce([]);
    const client = new AeriesClient(config);

    await client.getStudentPrograms(1, 0, '144');

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/aeries/api/v5/schools/1/students/0/programs');
    expect(url.searchParams.get('code')).toBe('144');
  });

  it('throws AeriesApiError with the status on a non-2xx response', async () => {
    mockFetchOnce('Forbidden', { ok: false, status: 401 });
    const client = new AeriesClient(config);

    await expect(client.getSchools()).rejects.toMatchObject({
      name: 'AeriesApiError',
      status: 401,
    });
  });
});

describe('AeriesClient.getAllPages', () => {
  it('walks pages until a short page and concatenates results', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) => ({ id: i }));
    const page2 = [{ id: 2 }]; // short page → stop
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page1 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => page2 });
    global.fetch = fetchMock as unknown as typeof fetch;

    const client = new AeriesClient(config);
    const all = await client.getAllPages('schools/1/students', { pageSize: 2 });

    expect(all).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstUrl = new URL(fetchMock.mock.calls[0][0]);
    const secondUrl = new URL(fetchMock.mock.calls[1][0]);
    expect(firstUrl.searchParams.get('StartingRecord')).toBe('1');
    expect(firstUrl.searchParams.get('EndingRecord')).toBe('2');
    expect(secondUrl.searchParams.get('StartingRecord')).toBe('3');
  });

  it('stops immediately on an empty first page', async () => {
    const fetchMock = mockFetchOnce([]);
    const client = new AeriesClient(config);

    const all = await client.getAllPages('schools/1/students', { pageSize: 100 });

    expect(all).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws rather than silently truncating when the page cap is hit', async () => {
    // Always return a full page → never a short/empty page → exhausts MAX_PAGES.
    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 1 }] });
    global.fetch = fetchMock as unknown as typeof fetch;
    const client = new AeriesClient(config);

    await expect(
      client.getAllPages('schools/1/students', { pageSize: 1 }),
    ).rejects.toMatchObject({ name: 'AeriesApiError', status: 508 });
  });
});

describe('AeriesApiError', () => {
  it('exposes message, status and path', () => {
    const err = new AeriesApiError('boom', 500, 'schools');
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(500);
    expect(err.path).toBe('schools');
  });
});
