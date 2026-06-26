import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listMyStudentChats,
  type ChatConversationSummary,
} from '@/lib/supabase/queries/chat';

interface UseStudentChatsReturn {
  chats: ChatConversationSummary[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Loads the current user's student-group chats (RLS-scoped to their teams),
 * optionally narrowed to the active school from the school dropdown.
 *
 * Each load is tagged with a monotonic request id so only the most recent one
 * may write state. Without this, switching schools while an earlier fetch is
 * still in flight could let the slower (older-school) response resolve last and
 * repopulate the list with the previous school's chats.
 */
export function useStudentChats(schoolId?: string | null): UseStudentChatsReturn {
  const [chats, setChats] = useState<ChatConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const result = await listMyStudentChats(schoolId);
      if (requestId !== requestIdRef.current) return; // superseded by a newer load
      setChats(result);
      setError(null);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      setChats([]);
      setError(e instanceof Error ? e.message : 'Failed to load chats');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    // Clear immediately on school switch so the prior school's chats never
    // linger under the new selection while the fresh load is in flight.
    setChats([]);
    void refresh();
  }, [refresh]);

  return { chats, loading, error, refresh };
}
