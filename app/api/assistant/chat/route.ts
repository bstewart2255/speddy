import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRoute } from '@/lib/api/with-route';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/monitoring/logger';
import { formatRoleLabel } from '@/lib/utils/role-utils';
import { canUseAssistant } from '@/lib/assistant/roles';
import { runAssistantChat, type AssistantTurn } from '@/lib/assistant/chat';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// A single exchange can include several Anthropic round-trips for tool calls;
// the chat loop's internal deadline (LOOP_DEADLINE_MS) keeps worst cases well
// under this ceiling.
export const maxDuration = 120;

/**
 * POST /api/assistant/chat — the Speddy Assistant (SPE-450).
 *
 * Provider-roles only, read-only: the assistant answers from the caller's own
 * RLS-scoped data and drafts text; it has no write path. Conversations are not
 * stored — the client sends the visible transcript each time.
 */

const MAX_TURNS = 30;
// User turns are what a person types; assistant turns are echoed back model
// replies, which can legitimately run longer (MAX_RESPONSE_TOKENS ≈ 6,000
// chars) — capping both at the user limit would break a conversation after
// one long reply.
const MAX_USER_TURN_CHARS = 4000;
const MAX_ASSISTANT_TURN_CHARS = 10_000;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(MAX_ASSISTANT_TURN_CHARS),
      })
    )
    .min(1)
    .max(MAX_TURNS)
    .refine((msgs) => msgs[0].role === 'user', {
      message: 'The first message must be from the user',
    })
    .refine((msgs) => msgs[msgs.length - 1].role === 'user', {
      message: 'The last message must be from the user',
    })
    .refine(
      (msgs) => msgs.every((m) => m.role === 'assistant' || m.content.length <= MAX_USER_TURN_CHARS),
      { message: `User messages are limited to ${MAX_USER_TURN_CHARS} characters` }
    ),
  // Both fields are interpolated into the system prompt, so they are pinned to
  // their expected value shapes — free text here would be a prompt-injection
  // channel.
  clientDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'clientDate must be YYYY-MM-DD')
    .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), {
      message: 'clientDate must be a real calendar date',
    }),
  clientTimezone: z
    .string()
    .max(64)
    .regex(/^[A-Za-z0-9+_/-]+$/, 'clientTimezone must be an IANA zone id')
    .optional(),
});

export const POST = withRoute<Record<string, string>, z.infer<typeof bodySchema>>(
  {
    aiGated: true,
    // The assistant can launch on its own switch while the master AI switch
    // (and with it the lesson/exit-ticket features) stays off (SPE-452).
    aiEnableFlag: 'ASSISTANT_ENABLED',
    body: bodySchema,
    rateLimit: { requests: 40, windowSeconds: 3600, name: 'assistant/chat', failClosed: true },
  },
  async ({ userId, body }) => {
    const supabase = await createClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      log.error('Assistant chat: failed to load profile', profileError, { userId });
      return NextResponse.json({ error: 'Could not verify your account' }, { status: 500 });
    }

    // Role gate before the config check: unauthorized roles get the same 403
    // whether or not the provider key is configured.
    if (!canUseAssistant(profile.role)) {
      return NextResponse.json(
        { error: 'The assistant is currently available to service providers only' },
        { status: 403 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      log.error('Assistant chat: ANTHROPIC_API_KEY not configured', null);
      return NextResponse.json({ error: 'Assistant is not configured' }, { status: 500 });
    }

    try {
      const { reply } = await runAssistantChat({
        supabase,
        userId,
        roleLabel: formatRoleLabel(profile.role),
        displayName: profile.full_name ?? null,
        clientDate: body.clientDate,
        clientTimezone: body.clientTimezone,
        messages: body.messages as AssistantTurn[],
      });
      return NextResponse.json({ reply });
    } catch (error) {
      // Never leak provider error details to the browser; log server-side only.
      log.error('Assistant chat failed', error, { userId });
      return NextResponse.json(
        { error: 'The assistant had a problem answering. Please try again.' },
        { status: 502 }
      );
    }
  }
);
