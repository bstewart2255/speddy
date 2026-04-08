'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '../ui/button';
import type { StaffWithHours, StaffRole, TeacherOption } from '@/lib/supabase/queries/staff';

const ROLE_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'instructional_assistant', label: 'Instructional Assistant' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'office', label: 'Office' },
];

const DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
];

type HoursEntry = {
  enabled: boolean;
  day_of_week: number;
  start_time: string;
  end_time: string;
};

interface StaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  staff: StaffWithHours | null; // null = create mode
  schoolId: string;
  teachers: TeacherOption[];
}

function initHours(existing?: StaffWithHours['staff_hours']): HoursEntry[] {
  return DAYS.map(day => {
    const match = existing?.find(h => h.day_of_week === day.value);
    return {
      enabled: !!match,
      day_of_week: day.value,
      start_time: match?.start_time || '08:00',
      end_time: match?.end_time || '15:00',
    };
  });
}

export function StaffModal({ isOpen, onClose, onSuccess, staff, schoolId, teachers }: StaffModalProps) {
  const isEdit = !!staff;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<StaffRole>('instructional_assistant');
  const [program, setProgram] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [status, setStatus] = useState('');
  const [hours, setHours] = useState<HoursEntry[]>(initHours());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when modal opens/closes or staff changes
  useEffect(() => {
    if (isOpen) {
      if (staff) {
        setFirstName(staff.first_name);
        setLastName(staff.last_name);
        setRole(staff.role as StaffRole);
        setProgram(staff.program || '');
        setTeacherId(staff.teacher_id || '');
        setRoomNumber(staff.room_number || '');
        setStatus(staff.status || '');
        setHours(initHours(staff.staff_hours));
      } else {
        setFirstName('');
        setLastName('');
        setRole('instructional_assistant');
        setProgram('');
        setTeacherId('');
        setRoomNumber('');
        setStatus('');
        setHours(initHours());
      }
      setError(null);
    }
  }, [isOpen, staff]);

  // Focus trap and Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
        return;
      }
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    },
    [saving, onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  const updateHour = (index: number, field: keyof HoursEntry, value: string | boolean) => {
    setHours(prev => prev.map((h, i) => i === index ? { ...h, [field]: value } : h));
  };

  const copyToAllDays = (sourceIndex: number) => {
    const source = hours[sourceIndex];
    setHours(prev => prev.map(h => ({
      ...h,
      enabled: true,
      start_time: source.start_time,
      end_time: source.end_time,
    })));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const enabledHours = hours
      .filter(h => h.enabled)
      .map(h => ({ day_of_week: h.day_of_week, start_time: h.start_time, end_time: h.end_time }));

    try {
      // Dynamic import to avoid circular deps
      const { createStaffMember, updateStaffMember } = await import('@/lib/supabase/queries/staff');

      if (isEdit && staff) {
        await updateStaffMember(staff.id, {
          first_name: firstName,
          last_name: lastName,
          role,
          program: program || null,
          teacher_id: teacherId || null,
          room_number: roomNumber || null,
          status: status || null,
          hours: enabledHours,
        });
      } else {
        await createStaffMember({
          first_name: firstName,
          last_name: lastName,
          role,
          school_id: schoolId,
          program: program || undefined,
          teacher_id: teacherId || undefined,
          room_number: roomNumber || undefined,
          status: status || undefined,
          hours: enabledHours,
        });
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staff member');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="staff-modal-title"
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 m-4 max-h-[90vh] overflow-y-auto"
      >
        <h2 id="staff-modal-title" className="text-lg font-semibold text-gray-900 mb-4">
          {isEdit ? 'Edit Staff Member' : 'Add Staff Member'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-first-name" className="block text-sm font-medium text-gray-700 mb-1">
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="staff-first-name"
                type="text"
                required
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="staff-last-name" className="block text-sm font-medium text-gray-700 mb-1">
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="staff-last-name"
                type="text"
                required
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Role */}
          <div>
            <label htmlFor="staff-role" className="block text-sm font-medium text-gray-700 mb-1">
              Role <span className="text-red-500">*</span>
            </label>
            <select
              id="staff-role"
              value={role}
              onChange={e => setRole(e.target.value as StaffRole)}
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              {ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Program & Teacher */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-program" className="block text-sm font-medium text-gray-700 mb-1">
                Program
              </label>
              <input
                id="staff-program"
                type="text"
                value={program}
                onChange={e => setProgram(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. RSP, SDC"
              />
            </div>
            <div>
              <label htmlFor="staff-teacher" className="block text-sm font-medium text-gray-700 mb-1">
                Teacher
              </label>
              <select
                id="staff-teacher"
                value={teacherId}
                onChange={e => setTeacherId(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">None</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {[t.last_name, t.first_name].filter(Boolean).join(', ') || 'Unnamed Teacher'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Room & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="staff-room" className="block text-sm font-medium text-gray-700 mb-1">
                Room Number
              </label>
              <input
                id="staff-room"
                type="text"
                value={roomNumber}
                onChange={e => setRoomNumber(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label htmlFor="staff-status" className="block text-sm font-medium text-gray-700 mb-1">
                Status
              </label>
              <input
                id="staff-status"
                type="text"
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g. .75 FTE"
              />
            </div>
          </div>

          {/* Site Time Hours */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Site Time Hours</label>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Day</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Start</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">End</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {hours.map((entry, index) => (
                    <tr key={entry.day_of_week} className={entry.enabled ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-3 py-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={entry.enabled}
                            onChange={e => updateHour(index, 'enabled', e.target.checked)}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{DAYS[index].short}</span>
                        </label>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={entry.start_time}
                          onChange={e => updateHour(index, 'start_time', e.target.value)}
                          disabled={!entry.enabled}
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="time"
                          value={entry.end_time}
                          onChange={e => updateHour(index, 'end_time', e.target.value)}
                          disabled={!entry.enabled}
                          className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {entry.enabled && (
                          <button
                            type="button"
                            onClick={() => copyToAllDays(index)}
                            className="text-xs text-blue-600 hover:text-blue-800"
                            title="Copy to all days"
                          >
                            Copy all
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <Button ref={cancelRef} type="button" onClick={onClose} variant="secondary" disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Staff Member'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
