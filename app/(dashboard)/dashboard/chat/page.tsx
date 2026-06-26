import { Suspense } from 'react';
import { StudentChatPage } from '@/app/components/chat/student-chat-page';

export default function ChatPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <Suspense fallback={<div className="text-sm text-gray-400">Loading chat…</div>}>
        <StudentChatPage />
      </Suspense>
    </div>
  );
}
