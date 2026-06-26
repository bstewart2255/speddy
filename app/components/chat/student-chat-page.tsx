'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { useStudentChats } from '@/lib/supabase/hooks/use-student-chats';
import {
  openStudentConversation,
  type ChatConversationSummary,
} from '@/lib/supabase/queries/chat';
import { ConversationList } from './conversation-list';
import { ChatThread } from './chat-thread';
import { NewChatDialog } from './new-chat-dialog';

interface SelectedChat {
  conversationId: string;
  studentId: string;
  studentInitials: string;
}

export function StudentChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { chats, loading, error, refresh } = useStudentChats();
  const [selected, setSelected] = useState<SelectedChat | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  const openStudent = useCallback(
    async (studentId: string) => {
      setOpenError(null);
      try {
        const { conversationId, studentInitials } = await openStudentConversation(studentId);
        setSelected({ conversationId, studentId, studentInitials });
        void refresh();
      } catch (e) {
        setOpenError(
          e instanceof Error ? e.message : 'Could not open this chat. You may not be on the team.',
        );
      }
    },
    [refresh],
  );

  // Deep link: /dashboard/chat?student=<id> opens (or creates) that chat once.
  const studentParam = searchParams.get('student');
  useEffect(() => {
    if (!studentParam) return;
    void openStudent(studentParam);
    // Clear the param so re-renders / back navigation don't re-trigger.
    router.replace('/dashboard/chat');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentParam]);

  const handleSelect = (chat: ChatConversationSummary) => {
    setSelected({
      conversationId: chat.id,
      studentId: chat.studentId,
      studentInitials: chat.studentInitials,
    });
  };

  const handlePick = (studentId: string) => {
    setShowNew(false);
    void openStudent(studentId);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-12rem)] max-w-6xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Left: conversation list */}
      <aside className="flex w-80 flex-shrink-0 flex-col border-r border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h1 className="text-sm font-semibold text-gray-900">Chats</h1>
          <Button size="sm" onClick={() => setShowNew(true)}>
            New chat
          </Button>
        </div>
        {openError && <div className="px-4 py-2 text-xs text-red-600">{openError}</div>}
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            chats={chats}
            selectedId={selected?.conversationId ?? null}
            onSelect={handleSelect}
            loading={loading}
            error={error}
          />
        </div>
      </aside>

      {/* Right: active thread */}
      <section className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <ChatThread
            key={selected.conversationId}
            conversationId={selected.conversationId}
            studentId={selected.studentId}
            studentInitials={selected.studentInitials}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
            Select a chat on the left, or start a new one to message a student’s team.
          </div>
        )}
      </section>

      <NewChatDialog isOpen={showNew} onClose={() => setShowNew(false)} onPick={handlePick} />
    </div>
  );
}
