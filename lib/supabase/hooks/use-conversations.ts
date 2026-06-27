import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listMyConversations,
  type ChatConversationSummary,
} from '@/lib/supabase/queries/chat';

interface UseConversationsReturn {
  conversations: ChatConversationSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads the current user's unified conversation list — student group chats
 * (scoped to the active school) plus all of their direct messages.
 *
 * Each load is tagged with a monotonic request id so only the most recent one
 * may write state; switching schools while an earlier fetch is in flight can't
 * repopulate the list with the previous school's results.
 */
export function useConversations(schoolId?: string | null): UseConversationsReturn {
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await listMyConversations(schoolId);
      if (requestId !== requestIdRef.current) return; // superseded by a newer load
      setConversations(result);
      setError(null);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      // Keep the current list on a failed refresh (e.g. the manual refresh after
      // opening a chat) — it's still valid for the active school. School changes
      // clear the list in the effect below, so we don't need to here.
      setError(e instanceof Error ? e.message : 'Failed to load conversations');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    // Both student chats and DMs are scoped to the active school, so clear the
    // whole list on a school switch while the fresh, re-scoped load is in flight.
    setConversations([]);
    void refresh();
  }, [refresh]);

  return { conversations, loading, error, refresh };
}
