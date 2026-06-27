'use client';

import type { ChatMessage } from '@/lib/supabase/queries/chat';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  senderName: string;
}

export function MessageBubble({ message, isMine, senderName }: MessageBubbleProps) {
  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-lg px-3 py-2 ${
          isMine ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900'
        }`}
      >
        {!isMine && (
          <div className="mb-0.5 text-xs font-semibold text-gray-600">{senderName}</div>
        )}
        <div className="whitespace-pre-wrap break-words text-sm">{message.body}</div>
        <div className={`mt-1 text-[10px] ${isMine ? 'text-blue-100' : 'text-gray-400'}`}>
          {formatTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}
