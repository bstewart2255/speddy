'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { useSchool } from '@/app/components/providers/school-context';
import { useConversations } from '@/lib/supabase/hooks/use-conversations';
import {
  openStudentConversation,
  openDirectConversation,
  type ChatConversationSummary,
} from '@/lib/supabase/queries/chat';
import { ConversationList } from './conversation-list';
import { ChatThread } from './chat-thread';
import { NewChatDialog } from './new-chat-dialog';

interface SelectedChat {
  conversationId: string;
  kind: 'student' | 'direct';
  studentId: string | null;
  title: string;
}

export function StudentChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentSchool } = useSchool();
  const schoolId = currentSchool?.school_id ?? null;
  const { conversations, loading, error, refresh } = useConversations(schoolId);
  const [selected, setSelected] = useState<SelectedChat | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);

  // When the active school changes, clear the open thread so the right pane
  // doesn't show a chat from a school the user is no longer viewing.
  useEffect(() => {
    setSelected(null);
  }, [schoolId]);

  const openStudent = useCallback(
    async (studentId: string) => {
      setOpenError(null);
      try {
        const { conversationId, studentInitials } = await openStudentConversation(studentId);
        setSelected({ conversationId, kind: 'student', studentId, title: studentInitials });
        void refresh();
      } catch (e) {
        console.error('openStudentConversation failed', e);
        setOpenError(
          e instanceof Error
            ? e.message
            : 'Could not open this chat. Please try again — if it keeps happening, refresh the page.',
        );
      }
    },
    [refresh],
  );

  const openPerson = useCallback(
    async (personId: string) => {
      setOpenError(null);
      try {
        const { conversationId, title } = await openDirectConversation(personId);
        setSelected({ conversationId, kind: 'direct', studentId: null, title });
        void refresh();
      } catch (e) {
        console.error('openDirectConversation failed', e);
        setOpenError(
          e instanceof Error
            ? e.message
            : 'Could not start this message. Please try again — if it keeps happening, refresh the page.',
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
      kind: chat.kind,
      studentId: chat.studentId,
      title: chat.title,
    });
  };

  const handlePickStudent = (studentId: string) => {
    setShowNew(false);
    void openStudent(studentId);
  };

  const handlePickPerson = (personId: string) => {
    setShowNew(false);
    void openPerson(personId);
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
            chats={conversations}
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
            kind={selected.kind}
            studentId={selected.studentId}
            title={selected.title}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-gray-400">
            Select a chat on the left, or start a new one to message a student’s team or a colleague.
          </div>
        )}
      </section>

      <NewChatDialog
        isOpen={showNew}
        onClose={() => setShowNew(false)}
        onPickStudent={handlePickStudent}
        onPickPerson={handlePickPerson}
        schoolId={schoolId}
      />
    </div>
  );
}
