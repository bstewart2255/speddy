'use client';

import type { ChatConversationSummary } from '@/lib/supabase/queries/chat';

function formatWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface ConversationListProps {
  chats: ChatConversationSummary[];
  selectedId: string | null;
  onSelect: (chat: ChatConversationSummary) => void;
  loading: boolean;
  error: string | null;
}

export function ConversationList({
  chats,
  selectedId,
  onSelect,
  loading,
  error,
}: ConversationListProps) {
  if (loading) {
    return <div className="px-4 py-6 text-sm text-gray-400">Loading chats…</div>;
  }
  if (error) {
    return <div className="px-4 py-6 text-sm text-red-600">{error}</div>;
  }
  if (chats.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-gray-400">
        No conversations yet. Start one with “New chat”.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-gray-100">
      {chats.map((chat) => {
        const isSelected = chat.id === selectedId;
        return (
          <li key={chat.id}>
            <button
              type="button"
              onClick={() => onSelect(chat)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
              }`}
            >
              <div
                className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  chat.kind === 'direct'
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-blue-100 text-blue-700'
                }`}
              >
                {chat.avatarText}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">
                    {chat.title}
                    {chat.subtitle ? (
                      <span className="ml-1 font-normal text-gray-400">· {chat.subtitle}</span>
                    ) : null}
                  </span>
                  <span className="flex-shrink-0 text-[11px] text-gray-400">
                    {formatWhen(chat.lastMessageAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-gray-500">
                    {chat.lastMessagePreview ?? 'No messages yet'}
                  </span>
                  {chat.unread && (
                    <span className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" aria-label="unread" />
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
