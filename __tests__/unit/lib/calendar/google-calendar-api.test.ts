import {
  chunkTimeRange,
  deleteCalendarEvent,
  freeBusyQuery,
  insertCalendarEvent,
} from '@/lib/calendar/google-calendar-api';

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
});

const DAY_MS = 24 * 60 * 60 * 1000;

describe('chunkTimeRange', () => {
  it('returns a single chunk for short ranges', () => {
    const chunks = chunkTimeRange(
      '2026-09-01T00:00:00Z',
      '2026-09-10T00:00:00Z'
    );
    expect(chunks).toEqual([
      { timeMin: '2026-09-01T00:00:00.000Z', timeMax: '2026-09-10T00:00:00.000Z' },
    ]);
  });

  it('splits long ranges into contiguous chunks ending at timeMax', () => {
    const start = '2026-09-01T00:00:00Z';
    const end = new Date(Date.parse(start) + 100 * DAY_MS).toISOString();
    const chunks = chunkTimeRange(start, end, 42);
    expect(chunks).toHaveLength(3);
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i].timeMin).toBe(chunks[i - 1].timeMax);
    }
    expect(chunks[chunks.length - 1].timeMax).toBe(end);
  });

  it('returns nothing for invalid or inverted ranges', () => {
    expect(chunkTimeRange('nope', '2026-09-01T00:00:00Z')).toEqual([]);
    expect(
      chunkTimeRange('2026-09-02T00:00:00Z', '2026-09-01T00:00:00Z')
    ).toEqual([]);
  });

  it('caps runaway ranges at the total-day limit', () => {
    const start = '2026-01-01T00:00:00Z';
    const end = new Date(Date.parse(start) + 3000 * DAY_MS).toISOString();
    const chunks = chunkTimeRange(start, end, 42);
    const totalMs =
      Date.parse(chunks[chunks.length - 1].timeMax) - Date.parse(start);
    expect(totalMs).toBeLessThanOrEqual(370 * DAY_MS);
  });
});

describe('freeBusyQuery', () => {
  it('merges busy intervals across chunks and skips errored calendars', async () => {
    const start = '2026-09-01T00:00:00Z';
    const end = new Date(Date.parse(start) + 60 * DAY_MS).toISOString(); // 2 chunks
    let call = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      call += 1;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          calendars: {
            primary: {
              busy: [
                {
                  start: `2026-09-0${call}T09:00:00Z`,
                  end: `2026-09-0${call}T10:00:00Z`,
                },
              ],
            },
            'blocked@district.org': {
              errors: [{ reason: 'notFound' }],
            },
          },
        }),
      };
    }) as unknown as typeof fetch;

    const result = await freeBusyQuery({
      accessToken: 'token',
      timeMin: start,
      timeMax: end,
      calendarIds: ['primary', 'blocked@district.org'],
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(result.primary).toHaveLength(2);
    expect(result['blocked@district.org']).toEqual([]);
  });

  it('throws a GoogleOAuthError shape on API failure without token material', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: { status: 'PERMISSION_DENIED', message: 'forbidden' },
      }),
    }) as unknown as typeof fetch;

    await expect(
      freeBusyQuery({
        accessToken: 'super-secret-access-token',
        timeMin: '2026-09-01T00:00:00Z',
        timeMax: '2026-09-02T00:00:00Z',
        calendarIds: ['primary'],
      })
    ).rejects.toMatchObject({
      name: 'GoogleOAuthError',
      code: 'PERMISSION_DENIED',
      status: 403,
    });
    await expect(
      freeBusyQuery({
        accessToken: 'super-secret-access-token',
        timeMin: '2026-09-01T00:00:00Z',
        timeMax: '2026-09-02T00:00:00Z',
        calendarIds: ['primary'],
      }).catch(e => e.message)
    ).resolves.not.toContain('super-secret');
  });
});

describe('insertCalendarEvent', () => {
  it('creates the event on the primary calendar and returns its id', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'evt_123' }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const id = await insertCalendarEvent({
      accessToken: 'token',
      summary: 'IEP — J.D. (hold)',
      startIso: '2026-09-15T16:00:00.000Z',
      endIso: '2026-09-15T17:00:00.000Z',
    });

    expect(id).toBe('evt_123');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/calendars/primary/events');
    const sent = JSON.parse(init.body as string);
    expect(sent.summary).toBe('IEP — J.D. (hold)');
    expect(sent.attendees).toBeUndefined(); // internal hold: nobody invited
  });

  it('rejects when Google returns no event id', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    }) as unknown as typeof fetch;

    await expect(
      insertCalendarEvent({
        accessToken: 'token',
        summary: 'x',
        startIso: '2026-09-15T16:00:00.000Z',
        endIso: '2026-09-15T17:00:00.000Z',
      })
    ).rejects.toMatchObject({ code: 'calendar_api_error' });
  });
});

describe('deleteCalendarEvent', () => {
  it.each([204, 404, 410])('treats HTTP %i as success', async status => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: async () => ({}),
    }) as unknown as typeof fetch;
    await expect(
      deleteCalendarEvent({ accessToken: 'token', eventId: 'evt' })
    ).resolves.toBeUndefined();
  });

  it('throws on other failures', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ error: { status: 'PERMISSION_DENIED' } }),
    }) as unknown as typeof fetch;
    await expect(
      deleteCalendarEvent({ accessToken: 'token', eventId: 'evt' })
    ).rejects.toMatchObject({ code: 'PERMISSION_DENIED' });
  });
});
