import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import {
  deleteChatMessage,
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
  remove: (messageId: string) => Promise<void>;
}

/**
 * Loads a conversation's messages and subscribes to live INSERTs and UPDATEs via
 * Supabase Realtime (same pattern as use-session-sync). RLS gates which rows the
 * subscriber receives. New messages are de-duped by id so the sender's own
 * optimistic append and the Realtime echo don't double up; UPDATEs (e.g. a
 * moderation soft-delete) replace the existing row in place so a "message
 * deleted" tombstone propagates live to everyone in the thread.
 */
export function useChatThread(conversationId: string | null): UseChatThreadReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabase = createClient();

  // Insert a new message, or replace an existing one in place when it changed
  // (e.g. a soft-delete arriving via the UPDATE listener). created_at/id are
  // immutable, so a replacement never changes ordering — no re-sort needed.
  // When nothing changed (the sender's own INSERT echo), return the same
  // reference so it doesn't trigger a needless re-render.
  const upsertMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx === -1) {
        const next = [...prev, msg];
        next.sort((a, b) =>
          a.createdAt === b.createdAt
            ? a.id.localeCompare(b.id)
            : a.createdAt.localeCompare(b.createdAt),
        );
        return next;
      }
      const existing = prev[idx];
      if (
        existing.body === msg.body &&
        existing.editedAt === msg.editedAt &&
        existing.deletedAt === msg.deletedAt
      ) {
        return prev;
      }
      const next = [...prev];
      next[idx] = msg;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let historyLoaded = false;
    setLoading(true);
    setError(null);
    setMessages([]); // clear the previous conversation

    // Load the history snapshot only after the channel has resolved, and MERGE
    // it into state (don't replace) so a live INSERT that arrived during the
    // subscribe handshake isn't lost. upsertMessage de-dupes by id.
    const loadHistory = () => {
      if (cancelled || historyLoaded) return;
      historyLoaded = true;
      getMessages(conversationId)
        .then((history) => {
          if (cancelled) return;
          setMessages((prev) => {
            const byId = new Map(prev.map((m) => [m.id, m]));
            for (const m of history) if (!byId.has(m.id)) byId.set(m.id, m);
            return [...byId.values()].sort((a, b) =>
              a.createdAt === b.createdAt
                ? a.id.localeCompare(b.id)
                : a.createdAt.localeCompare(b.createdAt),
            );
          });
          setLoading(false);
        })
        .catch((e) => {
          if (cancelled) return;
          setError(e instanceof Error ? e.message : 'Failed to load messages');
          setLoading(false);
        });
    };

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
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (cancelled) return;
          // The new row carries the full message (incl. deleted_at); upsertMessage
          // replaces it in place so a soft-delete tombstone appears live.
          upsertMessage(toChatMessage(payload.new as Parameters<typeof toChatMessage>[0]));
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          loadHistory();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // Realtime didn't connect; still load history so messages render
          // (without live updates) rather than spinning forever.
          loadHistory();
        }
      });
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

  const remove = useCallback(
    async (messageId: string) => {
      try {
        await deleteChatMessage(messageId);
        // Optimistically tombstone it for the moderator right away. The Realtime
        // UPDATE echo also arrives and reconciles (upsertMessage replaces by id);
        // doing it here too keeps the deleter's view correct even if Realtime is
        // down. We don't overwrite an existing deleted_at (idempotent re-delete).
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, deletedAt: m.deletedAt ?? new Date().toISOString() }
              : m,
          ),
        );
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete message');
        throw e;
      }
    },
    [],
  );

  return { messages, loading, error, sending, send, remove };
}
