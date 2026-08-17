/**
 * POST /api/assistant/chat (SPE-450) — the Speddy Assistant endpoint.
 *
 * What these tests pin, in order of how much they matter:
 *   - the route does not exist while the AI kill switch is off (404, no
 *     provider call) — same contract as every other AI route;
 *   - non-provider roles are refused (403) before any model call, so SEA /
 *     teacher / admin accounts can't reach the assistant by hitting the API
 *     directly;
 *   - a full tool round-trip works: the model asks for a tool, the tool result
 *     is fed back, and the final text lands in { reply };
 *   - malformed bodies are refused by validation (400);
 *   - an Anthropic failure returns a friendly 502 and never leaks provider
 *     error text to the browser.
 */
import { NextRequest } from 'next/server';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const mockCreate = jest.fn();
jest.mock('@anthropic-ai/sdk', () => ({
  __esModule: true,
  default: class MockAnthropic {
    messages = { create: (...args: unknown[]) => mockCreate(...args) };
    constructor(_opts: unknown) {}
  },
}));

let profileResult: { data: unknown; error: unknown } = {
  data: { role: 'resource', full_name: 'Pat Provider' },
  error: null,
};
let studentsResult: { data: unknown; error: unknown } = { data: [], error: null };

// One client serves both withRoute (auth.getUser) and the handler/tools.
function makeQuery(result: { data: unknown; error: unknown }) {
  const q: any = {};
  for (const m of ['select', 'eq', 'is', 'not', 'gte', 'lte', 'or', 'order', 'limit']) {
    q[m] = () => q;
  }
  q.single = async () => result;
  q.maybeSingle = async () => result;
  q.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return q;
}

jest.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID } }, error: null }),
    },
    from: (table: string) =>
      table === 'profiles' ? makeQuery(profileResult) : makeQuery(studentsResult),
  }),
}));

jest.mock('@/lib/api/rate-limit-user', () => ({
  checkUserRateLimit: async () => ({ allowed: true, remaining: 10, resetSeconds: 3600 }),
}));

const mockLogError = jest.fn();
jest.mock('@/lib/monitoring/logger', () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: (...a: unknown[]) => mockLogError(...a) },
}));

import { POST } from '@/app/api/assistant/chat/route';

const validBody = {
  messages: [{ role: 'user', content: 'What does my Tuesday look like?' }],
  clientDate: '2026-08-11',
  clientTimezone: 'America/Los_Angeles',
};

const req = (body: unknown = validBody) =>
  new NextRequest('http://localhost/api/assistant/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const textResponse = (text: string) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'text', text }],
  usage: { input_tokens: 100, output_tokens: 20 },
});

// Snapshot the env vars this suite mutates so later suites in the same Jest
// worker see the original values (same convention as with-route.test.ts).
const ENV_KEYS = ['AI_FEATURES_ENABLED', 'ASSISTANT_ENABLED', 'ANTHROPIC_API_KEY', 'ASSISTANT_MODEL'] as const;
const originalEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const key of ENV_KEYS) originalEnv[key] = process.env[key];
});
afterAll(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
});

beforeEach(() => {
  jest.clearAllMocks();
  // The suite runs on the assistant's OWN switch with the master AI switch
  // off — the launch configuration (SPE-452). One test below covers the
  // master switch enabling the route on its own.
  delete process.env.AI_FEATURES_ENABLED;
  process.env.ASSISTANT_ENABLED = 'true';
  process.env.ANTHROPIC_API_KEY = 'test-key';
  delete process.env.ASSISTANT_MODEL;
  profileResult = { data: { role: 'resource', full_name: 'Pat Provider' }, error: null };
  studentsResult = { data: [], error: null };
});

describe('POST /api/assistant/chat', () => {
  it('404s while both the master switch and ASSISTANT_ENABLED are off, without calling Anthropic', async () => {
    delete process.env.AI_FEATURES_ENABLED;
    delete process.env.ASSISTANT_ENABLED;
    const res = await POST(req());
    expect(res.status).toBe(404);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('the master AI switch alone also enables the route', async () => {
    delete process.env.ASSISTANT_ENABLED;
    process.env.AI_FEATURES_ENABLED = 'true';
    mockCreate.mockResolvedValueOnce(textResponse('Hi!'));
    const res = await POST(req());
    expect(res.status).toBe(200);
  });

  it('refuses non-provider roles before any model call — even when the key is unconfigured', async () => {
    // Gate-first ordering: unauthorized roles see the same 403 regardless of
    // provider configuration, so the response never reveals config state.
    delete process.env.ANTHROPIC_API_KEY;
    for (const role of ['teacher', 'sea', 'site_admin', 'district_admin', 'district_tech']) {
      mockCreate.mockClear();
      profileResult = { data: { role, full_name: 'Terry' }, error: null };
      const res = await POST(req());
      expect(res.status).toBe(403);
      expect(mockCreate).not.toHaveBeenCalled();
    }
  });

  it('answers a simple question with the configured defaults', async () => {
    mockCreate.mockResolvedValueOnce(textResponse('You have 3 sessions on Tuesday.'));

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: 'You have 3 sessions on Tuesday.' });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const call = mockCreate.mock.calls[0][0];
    expect(call.model).toBe('claude-haiku-4-5');
    // System rides as a cache-marked content block (tools + system cache
    // together across the loop's rounds once the model's minimum is met).
    expect(call.system).toHaveLength(1);
    expect(call.system[0].cache_control).toEqual({ type: 'ephemeral' });
    const systemText = call.system[0].text;
    expect(systemText).toContain('2026-08-11');
    expect(systemText).toContain('Pat Provider');
    // SPE-455: the assistant teaches the product and answers general sped
    // questions (with a verify-locally nudge) instead of refusing them.
    expect(systemText).toContain('How Speddy works');
    expect(systemText).toContain('General special-education guidance');
    expect(systemText).toContain('vary by state and district');
    expect(systemText).toContain('Need a human? Contact support');
    // Founder feedback 2026-08-12: no markdown asterisks, no raw column names,
    // and California timelines are stated from the verified list — not memory.
    expect(systemText).toContain('never use markdown formatting');
    expect(systemText).toContain('no asterisks');
    expect(systemText).toContain('Never show internal field or column names');
    expect(systemText).toContain('attribute them to California');
    expect(systemText).toContain('written request to review');
    expect(systemText).toContain('meeting held within 30 days');
    expect(systemText).toContain('the annual and three-year cycles do not pause');
    expect(systemText).toContain('Do NOT quote statutory deadlines or legal numbers that are not in the reference');
    expect(systemText).toContain('one short verification nudge');
    // SPE-466: founder-approved CA reference pack rides in the prompt — pin
    // one distinctive anchor per entry so a trim can't silently drop any.
    for (const anchor of [
      'Referral and assessment:',
      'Clock pauses:',
      '56321(a)',
      'Reviews:',
      'reevaluation is unnecessary',
      'Consent:',
      'services can be revoked in writing',
      'audio-record with 24 hours',
      'IEP team (56341):',
      'Transfers within California mid-year:',
      '56325(a)(2)',
      '5 business days',
      'Progress:',
      '56329(b)',
      'turns 16',
      '5 CCR 3043',
      '56505(l)',
      'waive it in writing or agree to mediation',
      'manifestation determination review',
    ]) {
      expect(systemText).toContain(anchor);
    }
    // SPE-539: the product guide is the assistant's ONLY knowledge of the UI,
    // so pin one distinctive anchor per topic. A trim that drops a topic, or a
    // feature change that rewrites a flow without updating the guide, fails
    // here instead of reaching a provider as a confidently wrong answer.
    for (const anchor of [
      // Layout and where things live
      'the nav bar has Dashboard, Students, Schedule',
      '"Ask AI" button beside it opens this assistant',
      'Chat (in the nav) is messaging with colleagues',
      'The setup checklist shows only the steps that apply to that person',
      // Secondary sites split by role (SPE-490, SPE-491, SPE-513)
      'Middle and high school (secondary) sites work differently, by role',
      'periods-by-days week view instead of the drag-and-drop grid',
      'Speech, OT, counseling and school psychologists keep everything except Special Activities',
      // Students and the student record
      '"+ Add Student"',
      '"As the IEP states it:"',
      'Student Goals Report → Generate Report → Download',
      'Current Information, IEP Goals, Assessments, Progress, Attendance',
      'it appears only where the wider AI features are switched on',
      // Scheduling
      'Balanced, Group by grade, Group by teacher, or Prefer mornings',
      'there is no "create group" button',
      '"Add Protected Time"',
      '"Add Mainstreaming Block"',
      '"Add Service Time"',
      'Where I see this student',
      // Everything else
      '"All Present"',
      "At a secondary site the page captures the school's period grid instead",
      'The activity name is picked from a fixed list',
      'cancelled but not deleted',
      '"Add Referral"',
      'Not possible in Speddy:',
    ]) {
      expect(systemText).toContain(anchor);
    }
    expect(call.tools.map((t: { name: string }) => t.name)).toEqual([
      'get_caseload',
      'get_schedule',
      'get_student_info',
    ]);
    // First round must not forbid tool use.
    expect(call.tool_choice).toBeUndefined();
  });

  it('completes a tool round-trip and feeds the result back to the model', async () => {
    studentsResult = {
      data: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          initials: 'AB',
          grade_level: '3',
          sessions_per_week: 2,
          minutes_per_session: 30,
          student_details: { iep_goals: ['reading'] },
        },
      ],
      error: null,
    };
    mockCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'tu_1', name: 'get_caseload', input: {} },
        ],
        usage: { input_tokens: 100, output_tokens: 30 },
      })
      .mockResolvedValueOnce(textResponse('You have 1 student: AB (grade 3).'));

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reply: 'You have 1 student: AB (grade 3).' });

    expect(mockCreate).toHaveBeenCalledTimes(2);
    const second = mockCreate.mock.calls[1][0];
    const lastMessage = second.messages[second.messages.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content[0].type).toBe('tool_result');
    expect(lastMessage.content[0].tool_use_id).toBe('tu_1');
    expect(lastMessage.content[0].is_error).toBe(false);
    expect(lastMessage.content[0].content).toContain('"initials":"AB"');
  });

  it('refuses a transcript that does not end with a user message', async () => {
    const res = await POST(
      req({ ...validBody, messages: [{ role: 'assistant', content: 'Hello!' }] })
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('refuses a transcript that starts with an assistant message', async () => {
    const res = await POST(
      req({
        ...validBody,
        messages: [
          { role: 'assistant', content: 'Earlier reply' },
          { role: 'user', content: 'Follow-up question' },
        ],
      })
    );
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('accepts a long echoed assistant turn but refuses an oversized user turn', async () => {
    // A 6,000-char assistant reply is a normal model output (~1,500 tokens);
    // rejecting it would permanently break the conversation that produced it.
    mockCreate.mockResolvedValueOnce(textResponse('Got it.'));
    const longAssistant = {
      ...validBody,
      messages: [
        { role: 'user', content: 'Summarize everything' },
        { role: 'assistant', content: 'a'.repeat(6000) },
        { role: 'user', content: 'Now shorten it' },
      ],
    };
    expect((await POST(req(longAssistant))).status).toBe(200);

    const longUser = {
      ...validBody,
      messages: [{ role: 'user', content: 'a'.repeat(6000) }],
    };
    expect((await POST(req(longUser))).status).toBe(400);
  });

  it('refuses a malformed clientDate', async () => {
    const res = await POST(req({ ...validBody, clientDate: 'today' }));
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('returns a friendly 502 when Anthropic fails, without leaking details', async () => {
    mockCreate.mockRejectedValueOnce(new Error('overloaded_error: capacity'));
    const res = await POST(req());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('The assistant had a problem answering. Please try again.');
    expect(JSON.stringify(body)).not.toContain('overloaded_error');
    expect(mockLogError).toHaveBeenCalled();
  });

  it('500s with a config message when the API key is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Assistant is not configured');
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
