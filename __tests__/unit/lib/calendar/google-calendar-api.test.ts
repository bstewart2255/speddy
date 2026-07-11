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
    const chunks = chunkTimeRange(start, end);
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
    const chunks = chunkTimeRange(start, end);
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
    expect(result.busyByCalendar.primary).toHaveLength(2);
    expect(result.busyByCalendar['blocked@district.org']).toEqual([]);
    expect(result.incomplete).toBe(false);
  });

  it('batches large calendar lists so nothing is silently dropped', async () => {
    const ids = ['primary', ...Array.from({ length: 25 }, (_, i) => `t${i}@d.org`)];
    const fetchMock = jest.fn().mockImplementation(async (_url, init) => {
      const sent = JSON.parse((init as RequestInit).body as string);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          calendars: Object.fromEntries(
            sent.items.map((item: { id: string }) => [
              item.id,
              {
                busy: [
                  { start: '2026-09-01T09:00:00Z', end: '2026-09-01T10:00:00Z' },
                ],
              },
            ])
          ),
        }),
      };
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await freeBusyQuery({
      accessToken: 'token',
      timeMin: '2026-09-01T00:00:00Z',
      timeMax: '2026-09-08T00:00:00Z', // single time chunk
      calendarIds: ids,
    });

    // 26 calendars → two batches (20 + 6) within the one time chunk.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      const sent = JSON.parse((call[1] as RequestInit).body as string);
      expect(sent.items.length).toBeLessThanOrEqual(20);
    }
    // Every calendar got data — including those beyond the first batch.
    expect(result.busyByCalendar['t24@d.org']).toHaveLength(1);
    expect(Object.keys(result.busyByCalendar)).toHaveLength(26);
    expect(result.incomplete).toBe(false);
  });

  it('flags API failures as incomplete instead of throwing, without token material', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: { status: 'PERMISSION_DENIED', message: 'forbidden' },
      }),
    }) as unknown as typeof fetch;

    const result = await freeBusyQuery({
      accessToken: 'super-secret-access-token',
      timeMin: '2026-09-01T00:00:00Z',
      timeMax: '2026-09-02T00:00:00Z',
      calendarIds: ['primary'],
    });

    expect(result.incomplete).toBe(true);
    expect(result.busyByCalendar.primary).toEqual([]);
    expect(errorSpy).toHaveBeenCalled();
    const logged = errorSpy.mock.calls.flat().map(String).join(' ');
    expect(logged).not.toContain('super-secret');
    errorSpy.mockRestore();
  });

  it('keeps data from healthy slices when another slice fails', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const start = '2026-09-01T00:00:00Z';
    const end = new Date(Date.parse(start) + 60 * DAY_MS).toISOString(); // 2 chunks
    let call = 0;
    global.fetch = jest.fn().mockImplementation(async () => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { status: 'RESOURCE_EXHAUSTED' } }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          calendars: {
            primary: {
              busy: [
                { start: '2026-10-05T09:00:00Z', end: '2026-10-05T10:00:00Z' },
              ],
            },
          },
        }),
      };
    }) as unknown as typeof fetch;

    const result = await freeBusyQuery({
      accessToken: 'token',
      timeMin: start,
      timeMax: end,
      calendarIds: ['primary'],
    });

    expect(result.incomplete).toBe(true);
    expect(result.busyByCalendar.primary).toHaveLength(1);
    errorSpy.mockRestore();
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
