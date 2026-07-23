'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from '@/app/contexts/toast-context';
import { formatTime } from '@/lib/utils/time-options';
import type { ScheduleSession } from '@/src/types';

type StudentInfo = { initials: string; grade_level?: string };

const DAY_LABEL = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// The 5-swatch group palette (accents / Week cards only — never the board fill,
// per design spec decision #6). Mirrors the approved mockup's group rails.
const GROUP_SWATCHES = ['#3b82f6', '#22c55e', '#a855f7', '#f97316', '#ec4899'];

export interface GroupPopoverData {
  anchor: DOMRect;
  members: ScheduleSession[]; // the clicked slot's cluster (already 2+)
}

interface GroupPopoverProps {
  data: GroupPopoverData;
  allSessions: ScheduleSession[]; // full board, for the cross-day "Meets" line
  students: Map<string, StudentInfo>;
  onClose: () => void;
  onMutated: () => void; // refresh the board after a change
  onOpenSession: (session: ScheduleSession) => void; // drill into one member
}

async function callMutate(body: Record<string, unknown>): Promise<{ groupId: string | null }> {
  const res = await fetch('/api/groups/mutate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Group change failed');
  return json;
}

const POP_W = 268;

export function GroupPopover({ data, allSessions, students, onClose, onMutated, onOpenSession }: GroupPopoverProps) {
  const { members, anchor } = data;
  const { showToast } = useToast();

  // A derived cluster has no durable record yet; the first edit materializes it.
  const initialRef = members.find(m => m.group_ref)?.group_ref ?? null;
  const [gref, setGref] = useState<string | null>(initialRef);
  const [name, setName] = useState(members.find(m => m.group_name)?.group_name ?? '');
  const [color, setColor] = useState<number | null>(members.find(m => m.group_color != null)?.group_color ?? null);
  const [busy, setBusy] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);

  const autoName = useMemo(
    () =>
      members
        .map(m => (m.student_id ? students.get(m.student_id)?.initials : undefined))
        .filter(Boolean)
        .join(', '),
    [members, students]
  );

  // "Meets" = the distinct day+time slots this group occupies. For a materialized
  // group that spans days, read them off the board via group_ref; a derived
  // cluster is just its one slot.
  const meets = useMemo(() => {
    const src = gref
      ? allSessions.filter(s => s.group_ref === gref && s.session_date === null && s.start_time)
      : members;
    const seen = new Set<string>();
    const out: Array<{ day: number; time: string }> = [];
    src.forEach(s => {
      if (!s.start_time || s.day_of_week == null) return;
      const k = `${s.day_of_week}|${s.start_time}`;
      if (!seen.has(k)) {
        seen.add(k);
        out.push({ day: s.day_of_week, time: s.start_time });
      }
    });
    return out.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));
  }, [gref, allSessions, members]);

  const isSea = members[0]?.delivered_by === 'sea' || members[0]?.delivered_by === 'specialist';

  // Position: below the plate, clamped to the viewport.
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    const left = Math.min(
      Math.max(anchor.left + anchor.width / 2 - POP_W / 2, 8),
      window.innerWidth - POP_W - 8
    );
    setPos({ top: anchor.bottom + 8, left });
  }, [anchor]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Materialize the group on first structural/naming edit, caching the id.
  const ensureGroup = async (): Promise<string> => {
    if (gref) return gref;
    const { groupId } = await callMutate({ action: 'form', sessionIds: members.map(m => m.id) });
    if (!groupId) throw new Error('Could not create the group');
    setGref(groupId);
    return groupId;
  };

  const saveNameColor = async (nextName: string, nextColor: number | null) => {
    setBusy(true);
    try {
      const id = await ensureGroup();
      await callMutate({ action: 'rename', groupId: id, name: nextName.trim() || null, color: nextColor });
      showToast('Group updated', 'success');
      onMutated();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not update the group', 'error');
    } finally {
      setBusy(false);
    }
  };

  const pickColor = (i: number) => {
    const next = color === i ? null : i;
    setColor(next);
    saveNameColor(name, next);
  };

  const doSplit = async (movingIds: string[]) => {
    setBusy(true);
    try {
      const id = await ensureGroup();
      await callMutate({ action: 'split', groupId: id, sessionIds: movingIds });
      showToast('Group split', 'success');
      onMutated();
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not split the group', 'error');
      setBusy(false);
    }
  };

  const slotMemberCount = members.length;

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-label="Group settings"
        className="fixed z-50 w-[268px] rounded-xl border border-gray-200 bg-white p-3.5 shadow-xl"
        style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        onClick={e => e.stopPropagation()}
      >
        {/* Name */}
        <input
          className="mb-2 w-full rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-sm font-semibold text-gray-900 placeholder:font-normal placeholder:italic placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={name}
          disabled={busy}
          placeholder={`${autoName || 'New group'} — name it (optional)`}
          aria-label="Group name"
          onChange={e => setName(e.target.value)}
          onBlur={() => {
            const current = members.find(m => m.group_name)?.group_name ?? '';
            if (name.trim() !== current.trim()) saveNameColor(name, color);
          }}
        />

        {/* Color swatches */}
        <div className="mb-3 flex gap-1.5">
          {GROUP_SWATCHES.map((hex, i) => (
            <button
              key={i}
              type="button"
              disabled={busy}
              aria-pressed={color === i}
              aria-label={`Color ${i + 1}`}
              onClick={() => pickColor(i)}
              className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 disabled:opacity-50 ${
                color === i ? 'border-gray-900 ring-2 ring-inset ring-white' : 'border-transparent'
              }`}
              style={{ background: hex }}
            />
          ))}
        </div>

        {/* Meets */}
        {meets.length > 0 && (
          <div className="mb-2 text-xs text-gray-600">
            Meets{' '}
            <span className="font-semibold text-gray-900">
              {meets.map(m => `${DAY_LABEL[m.day]} ${formatTime(m.time)}`).join(' · ')}
            </span>
            {meets.length > 1 && ' — one continuing thread'}
          </div>
        )}

        {/* Members */}
        <div className="mb-2.5 flex flex-col gap-0.5">
          {members.map(m => {
            const info = m.student_id ? students.get(m.student_id) : undefined;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onOpenSession(m)}
                className="group/mem flex w-full items-baseline gap-1.5 rounded-md px-1.5 py-1 text-left text-[13px] hover:bg-gray-50"
              >
                <span className="truncate text-gray-900">{info?.initials || '?'}</span>
                {info?.grade_level && <span className="text-xs text-gray-500">Gr{info.grade_level}</span>}
                <span className="ml-auto text-[11px] text-gray-400 group-hover/mem:text-blue-600">session ›</span>
              </button>
            );
          })}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1.5">
          {slotMemberCount > 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => setSplitOpen(true)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
            >
              Split group…
            </button>
          )}
        </div>

        <p className="mt-2.5 border-t border-gray-100 pt-2 text-[11px] leading-snug text-gray-400">
          Membership follows the schedule — move a session on the board to change who&rsquo;s here. History stays put either way.
          {isSea && ' This group is run by an SEA/specialist.'}
        </p>
      </div>

      {splitOpen && (
        <SplitModal
          members={members}
          students={students}
          busy={busy}
          onCancel={() => setSplitOpen(false)}
          onConfirm={doSplit}
        />
      )}
    </>
  );
}

// --- Split modal: two-bucket tap-to-move picker (design spec decision #8) ---

interface SplitModalProps {
  members: ScheduleSession[];
  students: Map<string, StudentInfo>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (movingIds: string[]) => void;
}

function SplitModal({ members, students, busy, onCancel, onConfirm }: SplitModalProps) {
  // Everyone starts in "stays"; tapping moves them to the new group.
  const [moving, setMoving] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setMoving(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const staying = members.filter(m => !moving.has(m.id));
  const canSave = moving.size >= 1 && staying.length >= 1;
  const label = (m: ScheduleSession) => (m.student_id ? students.get(m.student_id)?.initials : undefined) || '?';

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="mb-1 text-base font-semibold text-gray-900">Split group</h3>
        <p className="mb-4 text-sm text-gray-500">Tap a student to move them into a new group. The original keeps its name and history.</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-gray-300 bg-gray-50 p-3">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Stays</h4>
            <div className="flex flex-col gap-1.5">
              {staying.length === 0 && <p className="py-4 text-center text-xs text-gray-400">Keep at least one here</p>}
              {staying.map(m => (
                <button key={m.id} type="button" onClick={() => toggle(m.id)}
                  className="flex items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-blue-500">
                  <span>{label(m)}</span><span className="text-gray-400">→</span>
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-dashed border-gray-300 p-3">
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">New group</h4>
            <div className="flex flex-col gap-1.5">
              {moving.size === 0 && <p className="py-4 text-center text-xs text-gray-400">Tap students to move them here</p>}
              {members.filter(m => moving.has(m.id)).map(m => (
                <button key={m.id} type="button" onClick={() => toggle(m.id)}
                  className="flex items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:border-blue-500">
                  <span className="text-gray-400">←</span><span>{label(m)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancel</button>
          <button type="button" disabled={!canSave || busy} onClick={() => onConfirm(Array.from(moving))}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? 'Splitting…' : 'Split'}
          </button>
        </div>
      </div>
    </div>
  );
}
