'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { formatDateLocal } from '@/lib/utils/date-helpers';

/**
 * The Speddy Assistant (SPE-450): a chat panel where providers ask about their
 * own caseload/schedule and get drafting help. Read-only — the assistant never
 * changes data. Conversations live only in this component's state; nothing is
 * persisted, and a page reload starts fresh.
 *
 * Controlled by the navbar's "Ask AI" button. The component stays mounted while
 * closed so the conversation survives closing and reopening the panel.
 */

// Keep request payloads bounded; the server enforces the same caps.
const MAX_SENT_TURNS = 20;
const MAX_INPUT_CHARS = 4000;

interface Turn {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS = [
  'What does my schedule look like today?',
  'Which students are on my caseload?',
  'Draft a parent-friendly progress update',
];

interface AssistantPanelProps {
  open: boolean;
  onClose: () => void;
}

export default function AssistantPanel({ open, onClose }: AssistantPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Abandon any in-flight request when the panel unmounts.
  useEffect(() => () => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const nextTurns: Turn[] = [...turns, { role: 'user', content: trimmed }];
      setTurns(nextTurns);
      setInput('');
      setBusy(true);
      setError(null);

      // Window the transcript, then trim any leading assistant turn — the
      // Anthropic API requires the first message to be from the user, and a
      // plain slice can land the window on an assistant reply.
      const sent = nextTurns.slice(-MAX_SENT_TURNS);
      while (sent.length > 0 && sent[0].role === 'assistant') sent.shift();

      // Client-side ceiling just above the route's 120s budget, so a hung
      // request can't leave the composer disabled forever.
      const controller = new AbortController();
      abortRef.current = controller;
      const timer = setTimeout(() => controller.abort(), 125_000);

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            messages: sent,
            clientDate: formatDateLocal(new Date()),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        if (res.status === 404) {
          setError('AI features are currently turned off for this account.');
          return;
        }
        if (res.status === 429) {
          setError("You've reached the assistant limit for now — please try again in a little while.");
          return;
        }
        if (!res.ok) {
          setError('The assistant had a problem answering. Please try again.');
          return;
        }

        const data = (await res.json()) as { reply?: string };
        if (!data.reply) {
          setError('The assistant had a problem answering. Please try again.');
          return;
        }
        setTurns((current) => [...current, { role: 'assistant', content: data.reply as string }]);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setError('The request took too long and was cancelled. Please try again.');
        } else {
          setError('Could not reach the assistant. Check your connection and try again.');
        }
      } finally {
        clearTimeout(timer);
        setBusy(false);
      }
    },
    [busy, turns]
  );

  if (!open) return null;

  return (
    // bottom-24 keeps the Help Scout beacon launcher (bottom-right corner)
    // reachable while the panel is open.
    <div
      id="speddy-assistant-panel"
      className="fixed bottom-24 right-5 z-40 flex w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      style={{ height: 'min(560px, calc(100vh - 10rem))' }}
      role="dialog"
      aria-label="Speddy Assistant"
    >
      <div className="flex items-center justify-between border-b border-gray-200 bg-blue-600 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-semibold">Speddy Assistant</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 hover:bg-blue-700"
          aria-label="Close assistant"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} aria-live="polite" className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Ask about your schedule, caseload, or students&apos; goals — or ask for a draft
              (session notes, a parent email, a progress summary). Please refer to students
              by their initials, not full names.
            </p>
            <div className="space-y-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-left text-sm text-gray-700 hover:border-blue-300 hover:bg-blue-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((turn, i) => (
          <div key={i} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-600 px-3 py-2 text-sm text-white'
                  : 'max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-bl-md bg-gray-100 px-3 py-2 text-sm text-gray-900'
              }
            >
              {turn.content}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Thinking…
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 px-3 py-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_INPUT_CHARS))}
            onKeyDown={(e) => {
              // isComposing: don't submit while an IME (Japanese, Chinese,
              // Korean input) is confirming a candidate with Enter.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={1}
            placeholder="Ask the assistant…"
            className="max-h-28 min-h-[38px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="rounded-lg bg-blue-600 p-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-1 px-1 text-[11px] text-gray-400">
          AI can make mistakes — verify important details. It never changes your data.{' '}
          <button
            type="button"
            onClick={() => window.Beacon?.('open')}
            className="underline hover:text-gray-600"
          >
            Need a human? Contact support
          </button>
        </p>
      </div>
    </div>
  );
}
