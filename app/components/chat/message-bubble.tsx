'use client';

import type { ChatMessage } from '@/lib/supabase/queries/chat';

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: ChatMessage;
  isMine: boolean;
  senderName: string;
  /**
   * Whether to offer a delete affordance for this message — the sender's own
   * message, or any message for a site admin. The delete_chat_message RPC is the
   * real authority; this only decides whether the button is shown. Ignored once
   * the message is already deleted (a tombstone has no actions).
   */
  canDelete: boolean;
  onDelete: (messageId: string) => void;
}

export function MessageBubble({
  message,
  isMine,
  senderName,
  canDelete,
  onDelete,
}: MessageBubbleProps) {
  // Soft-deleted messages render as a tombstone — history stays intact (the row
  // is never removed), but the body is gone. Kept neutral and side-aligned so
  // the thread shape is preserved.
  if (message.deletedAt) {
    return (
      <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
        <div className="max-w-[75%] rounded-lg border border-dashed border-gray-200 px-3 py-2">
          <div className="text-sm italic text-gray-400">Message deleted</div>
        </div>
      </div>
    );
  }

  const deleteButton = canDelete ? (
    <button
      type="button"
      onClick={() => onDelete(message.id)}
      aria-label="Delete message"
      className="text-xs text-gray-400 opacity-0 transition hover:text-red-600 focus:opacity-100 focus:outline-none group-hover:opacity-100"
    >
      Delete
    </button>
  ) : null;

  return (
    <div className={`group flex items-center gap-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
      {isMine && deleteButton}
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
      {!isMine && deleteButton}
    </div>
  );
}
