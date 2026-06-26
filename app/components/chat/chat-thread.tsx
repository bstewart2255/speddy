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
  studentId: string;
  studentInitials: string;
}

export function ChatThread({ conversationId, studentId, studentInitials }: ChatThreadProps) {
  const { user } = useAuth();
  const { messages, loading, error, sending, send } = useChatThread(conversationId);
  const [participants, setParticipants] = useState<ChatParticipant[]>([]);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Participants (for the header and sender-name resolution).
  useEffect(() => {
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
  }, [studentId]);

  // Mark read on open and whenever new messages arrive while open.
  useEffect(() => {
    void markConversationRead(conversationId);
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const body = input;
    if (!body.trim()) return;
    setInput('');
    try {
      await send(body);
    } catch {
      setInput(body); // restore on failure so the user doesn't lose their text
    }
  };

  return (
    <div className="flex h-full flex-col">
      <ChatParticipantsHeader studentInitials={studentInitials} participants={participants} />

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
          messages.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              isMine={!!user && m.senderId === user.id}
              senderName={
                m.senderId ? nameById.get(m.senderId) ?? 'Former team member' : 'Former team member'
              }
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-gray-200 p-3">
        <input
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
