import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  getMessages,
  sendMessage,
  toChatMessage,
  type ChatMessage,
} from '@/lib/supabase/queries/chat';

interface UseChatThreadReturn {
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  sending: boolean;
  send: (body: string) => Promise<void>;
}

/**
 * Loads a conversation's messages and subscribes to live INSERTs via Supabase
 * Realtime (same pattern as use-session-sync). RLS gates which rows the
 * subscriber receives. New messages are de-duped by id so the sender's own
 * optimistic append and the Realtime echo don't double up.
 */
export function useChatThread(conversationId: string | null): UseChatThreadReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  const upsertMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      next.sort((a, b) =>
        a.createdAt === b.createdAt
          ? a.id.localeCompare(b.id)
          : a.createdAt.localeCompare(b.createdAt),
      );
      return next;
    });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getMessages(conversationId)
      .then((m) => {
        if (!cancelled) {
          setMessages(m);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load messages');
          setLoading(false);
        }
      });

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (cancelled) return;
          upsertMessage(toChatMessage(payload.new as Parameters<typeof toChatMessage>[0]));
        },
      )
      .subscribe();
    channelRef.current = channel;

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, supabase, upsertMessage]);

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!conversationId || !trimmed) return;
      setSending(true);
      try {
        const msg = await sendMessage(conversationId, trimmed);
        upsertMessage(msg); // Realtime will echo; upsert de-dupes by id.
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to send message');
        throw e;
      } finally {
        setSending(false);
      }
    },
    [conversationId, upsertMessage],
  );

  return { messages, loading, error, sending, send };
}
