import { createClient } from '@/lib/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  createdAt: string;
  editedAt: string | null;
  deletedAt: string | null;
}

export interface ChatConversationSummary {
  id: string;
  studentId: string;
  studentInitials: string;
  studentGrade: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unread: boolean;
}

export interface ChatParticipant {
  id: string;
  fullName: string | null;
  role: string;
}

export interface ChatStudentOption {
  id: string;
  initials: string;
  gradeLevel: string | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

// Maps a `messages` row (snake_case, e.g. from a query or a Realtime payload)
// into a ChatMessage. Tolerant of the partial shapes Realtime can deliver.
export function toChatMessage(row: {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
}): ChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id ?? null,
    body: row.body,
    createdAt: row.created_at,
    editedAt: row.edited_at ?? null,
    deletedAt: row.deleted_at ?? null,
  };
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/**
 * List the current user's student-group chats. RLS returns only conversations
 * the user can currently access, so this is inherently scoped to their team
 * memberships. Each summary carries the student initials, a last-message
 * preview, and an unread flag (last message newer than the user's read cursor).
 */
export async function listMyStudentChats(): Promise<ChatConversationSummary[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: convos, error } = await supabase
    .from('conversations')
    .select(
      'id, student_id, created_at, students!conversations_student_id_fkey(initials, grade_level)',
    )
    .eq('type', 'student_group');
  if (error) throw error;

  const conversations = convos ?? [];
  const ids = conversations.map((c) => c.id);
  if (ids.length === 0) return [];

  // Latest non-deleted message per conversation (reduce client-side).
  const { data: msgs } = await supabase
    .from('messages')
    .select('conversation_id, body, created_at')
    .in('conversation_id', ids)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const lastByConvo = new Map<string, { body: string; created_at: string }>();
  for (const m of msgs ?? []) {
    if (!lastByConvo.has(m.conversation_id)) {
      lastByConvo.set(m.conversation_id, { body: m.body, created_at: m.created_at });
    }
  }

  // The user's own read cursors (RLS: self-only).
  const { data: reads } = await supabase
    .from('conversation_read_state')
    .select('conversation_id, last_read_at')
    .in('conversation_id', ids);
  const readBy = new Map((reads ?? []).map((r) => [r.conversation_id, r.last_read_at]));

  const summaries: ChatConversationSummary[] = conversations.map((c) => {
    // Supabase returns the FK relation as an object or array depending on shape.
    const studentRel = c.students as
      | { initials: string; grade_level: string | null }
      | { initials: string; grade_level: string | null }[]
      | null;
    const student = Array.isArray(studentRel) ? studentRel[0] : studentRel;
    const last = lastByConvo.get(c.id) ?? null;
    const lastRead = readBy.get(c.id) ?? null;
    const unread = !!last && (!lastRead || new Date(last.created_at) > new Date(lastRead));
    return {
      id: c.id,
      studentId: c.student_id as string,
      studentInitials: student?.initials ?? '—',
      studentGrade: student?.grade_level ?? null,
      lastMessageAt: last?.created_at ?? null,
      lastMessagePreview: last?.body ?? null,
      unread,
    };
  });

  // Most recently active first; chats with no messages sort to the bottom.
  return summaries.sort((a, b) => (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? ''));
}

export interface OpenedConversation {
  conversationId: string;
  studentInitials: string;
  studentGrade: string | null;
}

/**
 * Open the student_group conversation for a student, creating it lazily if it
 * doesn't exist yet, and return it along with the student's display initials.
 * Conversation creation is gated by RLS (chat_is_student_participant), so this
 * only succeeds for a current team member. Handles the create race via the
 * one-chat-per-student unique index.
 */
export async function openStudentConversation(studentId: string): Promise<OpenedConversation> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: student } = await supabase
    .from('students')
    .select('initials, grade_level, school_id')
    .eq('id', studentId)
    .single();
  const studentInitials = student?.initials ?? '—';
  const studentGrade = student?.grade_level ?? null;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('type', 'student_group')
    .eq('student_id', studentId)
    .maybeSingle();
  if (existing) return { conversationId: existing.id, studentInitials, studentGrade };

  const { data: created, error } = await supabase
    .from('conversations')
    .insert({
      type: 'student_group',
      student_id: studentId,
      school_id: student?.school_id ?? null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error) {
    // Likely a concurrent create hitting the one-chat-per-student unique index;
    // re-select the winner.
    const { data: again } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'student_group')
      .eq('student_id', studentId)
      .maybeSingle();
    if (again) return { conversationId: again.id, studentInitials, studentGrade };
    throw error;
  }
  return { conversationId: created.id, studentInitials, studentGrade };
}

/** Fetch the full message history for a conversation (RLS-gated), oldest first. */
export async function getMessages(conversationId: string): Promise<ChatMessage[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(toChatMessage);
}

/** Send a message to a conversation. RLS enforces sender = self + access. */
export async function sendMessage(conversationId: string, body: string): Promise<ChatMessage> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_id: user.id, body })
    .select('id, conversation_id, sender_id, body, created_at, edited_at, deleted_at')
    .single();
  if (error) throw error;
  return toChatMessage(data);
}

/**
 * Chat-eligible participants for a student's chat (those with a Speddy account).
 * Backed by the get_student_chat_participants RPC, which itself requires the
 * caller to be on the student's team.
 */
export async function getParticipants(studentId: string): Promise<ChatParticipant[]> {
  const supabase = createClient();
  const { data: ids, error } = await supabase.rpc('get_student_chat_participants', {
    p_student_id: studentId,
  });
  if (error) throw error;
  const idList = (ids ?? []) as string[];
  if (idList.length === 0) return [];

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .in('id', idList);
  return (profiles ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name ?? null,
    role: p.role,
  }));
}

/** Mark a conversation read up to now for the current user (drives unread). */
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('conversation_read_state').upsert(
    {
      conversation_id: conversationId,
      profile_id: user.id,
      last_read_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id,profile_id' },
  );
}

/**
 * Whether the current user is on a given student's chat team. Backs the
 * contextual "Team chat" entry point, so it only shows for actual participants
 * (and never for SEAs, who are excluded from the membership union).
 */
export async function isStudentChatParticipant(studentId: string): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data, error } = await supabase.rpc('chat_is_student_participant', {
    p_student_id: studentId,
    p_uid: user.id,
  });
  if (error) return false;
  return data === true;
}

/**
 * Students the current user can start a chat about. RLS on `students` scopes
 * this to their caseload / school. Conversation creation is independently gated
 * by chat_is_student_participant, so this list is only a convenience picker.
 */
export async function listChatStudents(): Promise<ChatStudentOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('students')
    .select('id, initials, grade_level')
    .order('initials', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    initials: s.initials,
    gradeLevel: s.grade_level ?? null,
  }));
}
