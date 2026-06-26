import { useCallback, useEffect, useState } from 'react';
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

/** Loads the current user's student-group chats (RLS-scoped to their teams). */
export function useStudentChats(): UseStudentChatsReturn {
  const [chats, setChats] = useState<ChatConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setChats(await listMyStudentChats());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { chats, loading, error, refresh };
}
