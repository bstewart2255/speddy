import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { log } from '@/lib/monitoring/logger';
import { assistantTools, executeAssistantTool } from './tools';

/**
 * The Speddy Assistant chat loop (SPE-450).
 *
 * One request = one full agentic exchange: the model may call the read-only
 * assistant tools a bounded number of times, then must answer in plain text.
 * Nothing is persisted server-side — the client resends the visible transcript
 * (text turns only) on each request, and tool traffic stays inside this call.
 */

const DEFAULT_MODEL = 'claude-haiku-4-5';
const MAX_TOOL_ROUNDS = 6;
const MAX_RESPONSE_TOKENS = 1500;
// Leave headroom under the route's 60s maxDuration for a final response.
const REQUEST_TIMEOUT_MS = 50_000;

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatArgs {
  supabase: SupabaseClient;
  userId: string;
  /** Human-readable role label, e.g. "Resource Specialist". */
  roleLabel: string;
  displayName: string | null;
  /** The user's local date, YYYY-MM-DD (sent by the browser). */
  clientDate: string;
  clientTimezone?: string;
  messages: AssistantTurn[];
}

export function buildSystemPrompt(args: Pick<AssistantChatArgs, 'roleLabel' | 'displayName' | 'clientDate' | 'clientTimezone'>): string {
  const who = args.displayName ?? 'a provider';
  const tz = args.clientTimezone ? ` (timezone: ${args.clientTimezone})` : '';
  return `You are the Speddy Assistant, a helper built into Speddy, a scheduling and caseload tool for school special-education service providers.

You are talking to ${who} (role: ${args.roleLabel}), signed into their own Speddy account. Today's date is ${args.clientDate}${tz}.

What you can do:
- Answer questions about their caseload, students' IEP goals, service minutes, and their session schedule, using the tools provided.
- Draft text they ask for: session notes, parent-friendly emails or updates, progress summaries, meeting talking points.

Data rules:
- The tools return only data this user is allowed to see: their own caseload and schedule. You cannot see other providers' data, and you cannot change anything — you are read-only.
- Base every factual claim about their students or schedule on tool results from this conversation. Never invent students, sessions, goals, or dates. If a tool returns no matching data, say so plainly.
- In schedule data, day_of_week runs 1 = Monday through 5 = Friday, and the school week is Monday to Friday. Resolve relative dates ("today", "this week") from today's date above.

Sensitive-data care:
- This is student education data. Refer to students the way the data does (initials, or first names when recorded). Do not speculate about diagnoses or eligibility, and do not give medical or legal advice — clinical and compliance judgments belong to the provider.
- When drafting parent-facing text, keep a warm, professional tone and include only facts from the data or from what the user told you.

Style:
- Be concise and practical. Plain text only — no markdown headers or tables; short dash lists are fine.
- If the request is ambiguous (which student, which week), ask one short clarifying question instead of guessing.`;
}

export async function runAssistantChat(args: AssistantChatArgs): Promise<{ reply: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured');
  }

  const anthropic = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 1 });
  const model = process.env.ASSISTANT_MODEL || DEFAULT_MODEL;
  const system = buildSystemPrompt(args);
  const startTime = Date.now();

  const messages: Anthropic.MessageParam[] = args.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS;
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_RESPONSE_TOKENS,
      system,
      messages,
      tools: assistantTools,
      // On the final permitted round, forbid further tool use so the model
      // answers with what it has instead of hitting the loop ceiling mid-call.
      // (Tool definitions must stay present once the transcript contains
      // tool_use blocks, so restrict via tool_choice rather than omitting.)
      ...(isLastRound ? { tool_choice: { type: 'none' as const } } : {}),
    });

    if (response.stop_reason === 'tool_use') {
      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      messages.push({ role: 'assistant', content: response.content });

      const results: Anthropic.ToolResultBlockParam[] = await Promise.all(
        toolUses.map(async (use) => {
          const result = await executeAssistantTool(
            args.supabase,
            args.userId,
            use.name,
            (use.input ?? {}) as Record<string, unknown>
          );
          return {
            type: 'tool_result' as const,
            tool_use_id: use.id,
            content: JSON.stringify(result.ok ? result.data : { error: result.error }),
            is_error: !result.ok,
          };
        })
      );

      messages.push({ role: 'user', content: results });
      continue;
    }

    const reply = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();

    log.info('Assistant chat completed', {
      model,
      rounds: round,
      durationMs: Date.now() - startTime,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });

    return {
      reply: reply || "I couldn't come up with a response for that — could you rephrase the question?",
    };
  }

  // Unreachable: the last round carries no tools, so it cannot stop on
  // tool_use. Kept as a safety net rather than a thrown error.
  return { reply: 'I had trouble finishing that request. Please try asking it in a simpler way.' };
}
