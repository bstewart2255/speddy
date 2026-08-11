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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [turns, busy, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;

      const nextTurns: Turn[] = [...turns, { role: 'user', content: trimmed }];
      setTurns(nextTurns);
      setInput('');
      setBusy(true);
      setError(null);

      try {
        const res = await fetch('/api/assistant/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: nextTurns.slice(-MAX_SENT_TURNS),
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
      } catch {
        setError('Could not reach the assistant. Check your connection and try again.');
      } finally {
        setBusy(false);
      }
    },
    [busy, turns]
  );

  if (!open) return null;

  return (
    <div
      className="fixed bottom-6 right-5 z-40 flex w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
      style={{ height: 'min(560px, calc(100vh - 8rem))' }}
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

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Ask about your schedule, caseload, or students&apos; goals — or ask for a draft
              (session notes, a parent email, a progress summary).
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
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
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
              if (e.key === 'Enter' && !e.shiftKey) {
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
          AI can make mistakes — verify important details. Read-only: it never changes your data.
        </p>
      </div>
    </div>
  );
}
