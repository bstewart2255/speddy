'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/app/components/ui/button';
import { useAuth } from '@/app/components/providers/auth-provider';
import { useChatThread } from '@/lib/supabase/hooks/use-chat-thread';
import {
  getParticipants,
  markConversationRead,
  type ChatParticipant,
} from '@/lib/supabase/queries/chat';
import { MessageBubble } from './message-bubble';
import { ChatParticipantsHeader } from './chat-participants-header';

interface ChatThreadProps {
  conversationId: string;
  kind: 'student' | 'direct';
  /** Student group chats only — drives the participant header. Null for DMs. */
  studentId: string | null;
  /** Student initials (group) or the other person's name (DM). */
  title: string;
}

export function ChatThread({ conversationId, kind, studentId, title }: ChatThreadProps) {
  const { user } = useAuth();
  const { messages, loading, error, sending, send } = useChatThread(conversationId);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Student group participants (header + sender-name resolution). DMs have only
  // two people, so they don't need this lookup.
  useEffect(() => {
    if (kind !== 'student' || !studentId) {
      setParticipants([]);
      return;
    }
    let cancelled = false;
    getParticipants(studentId)
      .then((p) => {
        if (!cancelled) setParticipants(p);
      })
      .catch(() => {
        /* header simply shows fewer names; non-fatal */
      });
    return () => {
      cancelled = true;
    };
  }, [kind, studentId]);

  // Mark read on open and whenever new messages arrive while open.
  useEffect(() => {
    markConversationRead(conversationId).catch(() => {
      /* non-fatal: the unread badge may be briefly stale */
    });
  }, [conversationId, messages.length]);

  // Keep the latest message in view.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of participants) m.set(p.id, p.fullName ?? 'Unknown');
    return m;
  }, [participants]);

  // In a DM there are exactly two people, so any message that isn't mine is from
  // the other person (whose name is the thread title).
  const senderNameFor = (senderId: string | null, isMine: boolean): string => {
    if (!senderId) return 'Former member';
    if (kind === 'direct') return isMine ? 'You' : title;
    return nameById.get(senderId) ?? 'Former team member';
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = input;
    if (!body.trim()) return;
    setInput('');
    try {
      await send(body);
    } catch {
      // Restore the failed text only if the user hasn't started a new draft
      // while the request was in flight.
      setInput((current) => (current === '' ? body : current));
    }
  };

  return (
    <div className="flex h-full flex-col">
      {kind === 'student' ? (
        <ChatParticipantsHeader studentInitials={title} participants={participants} />
      ) : (
        <div className="border-b border-gray-200 px-4 py-3">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500">Direct message</div>
        </div>
      )}

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading ? (
          <div className="text-sm text-gray-400">Loading messages…</div>
        ) : error ? (
          <div className="text-sm text-red-600">{error}</div>
        ) : messages.length === 0 ? (
          <div className="mt-8 text-center text-sm text-gray-400">
            No messages yet. Say hello to the team.
          </div>
        ) : (
          messages.map((m) => {
            const isMine = !!user && m.senderId === user.id;
            return (
              <MessageBubble
                key={m.id}
                message={m}
                isMine={isMine}
                senderName={senderNameFor(m.senderId, isMine)}
              />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-gray-200 p-3">
        <input
          aria-label="Message"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Write a message…"
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <Button type="submit" disabled={!input.trim() || sending} isLoading={sending}>
          Send
        </Button>
      </form>
    </div>
  );
}
