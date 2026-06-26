'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/app/components/ui/button';
import { isStudentChatParticipant } from '@/lib/supabase/queries/chat';

interface TeamChatButtonProps {
  studentId: string;
  /** Called just before navigating (e.g. to close an open modal). */
  onNavigate?: () => void;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
}

const ChatIcon = (
  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
    />
  </svg>
);

/**
 * Contextual entry point into a student's team chat. Renders only for users who
 * are actually on that student's chat team (so SEAs and unrelated staff never
 * see it). Deep-links to the dedicated chat page, which opens/creates the chat.
 */
export function TeamChatButton({
  studentId,
  onNavigate,
  size = 'sm',
  variant = 'secondary',
}: TeamChatButtonProps) {
  const router = useRouter();
  const [eligible, setEligible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    isStudentChatParticipant(studentId)
      .then((v) => {
        if (!cancelled) setEligible(v);
      })
      .catch(() => {
        /* hide on failure */
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (!eligible) return null;

  return (
    <Button
      size={size}
      variant={variant}
      leftIcon={ChatIcon}
      onClick={() => {
        onNavigate?.();
        router.push(`/dashboard/chat?student=${encodeURIComponent(studentId)}`);
      }}
    >
      Team chat
    </Button>
  );
}
