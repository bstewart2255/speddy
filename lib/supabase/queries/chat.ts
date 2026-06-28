import { createClient } from '@/lib/supabase/client';
import { formatRoleLabel } from '@/lib/utils/role-utils';

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

/**
 * A row in the unified conversation list — either a student group chat or a 1:1
 * direct message. `kind` discriminates; `title`/`subtitle`/`avatarText` are the
 * rendered display (student initials + grade, or the other person's name + role).
 */
export interface ChatConversationSummary {
  id: string;
  kind: 'student' | 'direct';
  title: string;
  subtitle: string | null;
  avatarText: string;
  /** Set for student group chats (drives the participant header); null for DMs. */
  studentId: string | null;
  lastMessageAt: string | null;
  /** Conversation creation time — recency fallback so a brand-new, empty chat
   * doesn't sort to the bottom until its first message. */
  createdAt: string;
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

export interface ChatPersonOption {
  id: string;
  fullName: string;
  role: string;
}

/** Up-to-two-letter avatar text from a display name (e.g. "Sara Harris" -> "SH"). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
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
 * The unified conversation list — the user's student group chats and direct
 * messages, scoped to the active school, most-recent first. Backed by the
 * get_my_conversations RPC, which computes the latest-message preview and unread
 * flag DB-side in one round-trip (no full message-history scan — see SPE-200).
 */
export async function listMyConversations(
  schoolId?: string | null,
): Promise<ChatConversationSummary[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_my_conversations', {
    p_school_id: schoolId ?? undefined,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    kind: 'student' | 'direct';
    student_id: string | null;
    student_initials: string | null;
    student_grade: string | null;
    other_name: string | null;
    other_role: string | null;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
    unread: boolean;
  }>;
  // The RPC already orders rows by recency (latest message, else creation time).
  return rows.map((r) => {
    if (r.kind === 'direct') {
      const name = r.other_name ?? 'Unknown';
      return {
        id: r.id,
        kind: 'direct',
        title: name,
        subtitle: r.other_role ? formatRoleLabel(r.other_role) : null,
        avatarText: initialsOf(name),
        studentId: null,
        lastMessageAt: r.last_message_at,
        createdAt: r.created_at,
        lastMessagePreview: r.last_message_preview,
        unread: r.unread,
      };
    }
    const initials = r.student_initials ?? '—';
    return {
      id: r.id,
      kind: 'student',
      title: initials,
      subtitle: r.student_grade,
      avatarText: initials,
      studentId: r.student_id,
      lastMessageAt: r.last_message_at,
      createdAt: r.created_at,
      lastMessagePreview: r.last_message_preview,
      unread: r.unread,
    };
  });
}

export interface OpenedConversation {
  conversationId: string;
  studentInitials: string;
  studentGrade: string | null;
}

/**
 * Open the student_group conversation for a student, creating it lazily if it
 * doesn't exist yet, and return it along with the student's display initials.
 *
 * Creation goes through the open_student_conversation RPC (SECURITY DEFINER),
 * which performs the same authorization itself (is_chat_eligible + the
 * chat_is_student_participant team check) and inserts as the owner. This is the
 * single reliable write path: a direct client insert against `conversations`
 * was intermittently rejected by the table's INSERT policy with a misleading
 * 42501 even for valid team members, whereas the RPC (called like the working
 * student picker) does not depend on that policy and forces created_by =
 * auth.uid(). The one-chat-per-student race is handled inside the RPC.
 */
export async function openStudentConversation(studentId: string): Promise<OpenedConversation> {
  const supabase = createClient();

  // Open (or create) the conversation via the authorized RPC first — it is the
  // source of truth for access. The student read below is display-only and must
  // not gate opening: students RLS can be stricter than the chat team check, so
  // a valid team member (e.g. a serving provider) could otherwise be blocked.
  const { data: conversationId, error } = await supabase.rpc('open_student_conversation', {
    p_student_id: studentId,
  });
  if (error) throw new Error(`Couldn't start this chat: ${describeDbError(error)}`);
  if (!conversationId) throw new Error("Couldn't start this chat: no conversation returned.");

  // Best-effort display details; a denied/missing read just falls back to placeholders.
  const { data: student } = await supabase
    .from('students')
    .select('initials, grade_level')
    .eq('id', studentId)
    .maybeSingle();

  return {
    conversationId: conversationId as string,
    studentInitials: student?.initials ?? '—',
    studentGrade: student?.grade_level ?? null,
  };
}

/**
 * Turn a Supabase/Postgrest error (a plain object, NOT an Error instance) into a
 * human-readable string that includes the code, so failures aren't swallowed
 * behind generic UI messages. Safe for any thrown value.
 */
function describeDbError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { message?: string; code?: string; details?: string; hint?: string };
    const parts = [e.message, e.details, e.hint].filter(Boolean);
    const text = parts.join(' — ') || 'Unknown database error';
    return e.code ? `${text} [${e.code}]` : text;
  }
  return typeof err === 'string' ? err : 'Unknown error';
}

export interface OpenedDirectConversation {
  conversationId: string;
  title: string;
}

/**
 * People the current user can start a direct message with at the given school —
 * chat-eligible colleagues who share that site (excludes self, SEAs, and
 * district admins). Backed by the get_dm_eligible_people RPC; school-scoped to
 * the active school like the student picker.
 */
export async function listDmEligiblePeople(
  schoolId: string | null,
): Promise<ChatPersonOption[]> {
  if (!schoolId) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_dm_eligible_people', { p_school_id: schoolId });
  if (error) throw error;
  const rows = (data ?? []) as Array<{ id: string; full_name: string | null; role: string }>;
  return rows.map((r) => ({ id: r.id, fullName: r.full_name ?? 'Unknown', role: r.role }));
}

/**
 * Open (or create) the 1:1 direct message with another person. Goes through the
 * open_direct_conversation RPC (SECURITY DEFINER), which enforces eligibility +
 * same-site, dedupes on the normalized pair, and creates the two participant
 * rows. Returns the conversation id and a display title (the other person).
 */
export async function openDirectConversation(otherId: string): Promise<OpenedDirectConversation> {
  const supabase = createClient();
  const { data: conversationId, error } = await supabase.rpc('open_direct_conversation', {
    p_other_id: otherId,
  });
  if (error) throw new Error(`Couldn't start this message: ${describeDbError(error)}`);
  if (!conversationId) throw new Error("Couldn't start this message: no conversation returned.");

  // Best-effort display name for the thread header.
  const { data: prof } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', otherId)
    .maybeSingle();
  return { conversationId: conversationId as string, title: prof?.full_name ?? 'Direct message' };
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
 * Soft-delete a single message (moderation). Goes through the delete_chat_message
 * RPC (SECURITY DEFINER) — the sole moderation write path now that the direct
 * UPDATE policy is gone. The RPC authorizes the caller itself: the sender may
 * delete their own message; a site admin may delete any message in a conversation
 * they can access. There is no editing. The soft-delete propagates to other open
 * threads via the Realtime UPDATE listener (use-chat-thread).
 */
export async function deleteChatMessage(messageId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc('delete_chat_message', {
    p_message_id: messageId,
  });
  if (error) throw new Error(`Couldn't delete this message: ${describeDbError(error)}`);
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

/**
 * Mark a conversation read up to now for the current user (drives unread).
 * Uses the mark_conversation_read RPC so the read cursor is stamped with the
 * server clock (now()) rather than the browser's — message timestamps are
 * server-generated, so a skewed device clock would otherwise corrupt unread
 * state. The RPC forces profile_id = auth.uid() and stays RLS-gated.
 */
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc('mark_conversation_read', {
    p_conversation_id: conversationId,
  });
  if (error) throw error;
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
 * The current user's profile role (e.g. 'resource', 'site_admin'), or null if it
 * can't be read. Used to decide whether to show the admin delete affordance —
 * a site admin may soft-delete any message, not just their own. The RPC remains
 * the real authority; this only gates whether the button is offered.
 */
export async function getCurrentUserRole(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (error) return null;
  return data?.role ?? null;
}

/**
 * Students the current user can actually start a chat about — the ones they are
 * on the team for (participant set), optionally scoped to the active school.
 * Backed by the get_my_chat_students RPC. Using the participant set (not every
 * RLS-visible student) means the picker never offers a student whose chat the
 * user would be denied from opening.
 */
export async function listMyChatStudents(
  schoolId?: string | null,
): Promise<ChatStudentOption[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('get_my_chat_students', {
    p_school_id: schoolId ?? undefined,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id: string;
    initials: string;
    grade_level: string | null;
  }>;
  return rows.map((s) => ({
    id: s.id,
    initials: s.initials,
    gradeLevel: s.grade_level ?? null,
  }));
}
