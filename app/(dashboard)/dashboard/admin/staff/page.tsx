'use client';

import { useState, useEffect } from 'react';
import { getCurrentAdminPermissions } from '@/lib/supabase/queries/admin-accounts';
import {
  getSchoolStaffMembers,
  getSchoolTeacherOptions,
  deleteStaffMember,
  type StaffWithHours,
  type StaffRole,
  type TeacherOption,
} from '@/lib/supabase/queries/staff';
import { Card } from '@/app/components/ui/card';
import { StaffModal } from '@/app/components/admin/staff-modal';
import { ConfirmationModal } from '@/app/components/ui/confirmation-modal';
import { useToast } from '@/app/contexts/toast-context';

const ROLE_LABELS: Record<StaffRole, string> = {
  instructional_assistant: 'Instructional Asst.',
  supervisor: 'Supervisor',
  office: 'Office',
};

const DAY_SHORT = ['', 'M', 'T', 'W', 'Th', 'F'];

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'p' : 'a';
  const hour = h % 12 || 12;
  return m === 0 ? `${hour}${period}` : `${hour}:${m.toString().padStart(2, '0')}${period}`;
}

function formatHoursSummary(hours: StaffWithHours['staff_hours']): string {
  if (!hours || hours.length === 0) return '—';

  const sorted = [...hours].sort((a, b) => a.day_of_week - b.day_of_week);

  // Group consecutive days with the same times
  const groups: { days: number[]; start: string; end: string }[] = [];
  for (const h of sorted) {
    const last = groups[groups.length - 1];
    if (last && last.start === h.start_time && last.end === h.end_time) {
      last.days.push(h.day_of_week);
    } else {
      groups.push({ days: [h.day_of_week], start: h.start_time, end: h.end_time });
    }
  }

  return groups.map(g => {
    const dayStr = g.days.length === 5
      ? 'M-F'
      : g.days.length > 2 && g.days.every((d, i) => i === 0 || d === g.days[i - 1] + 1)
        ? `${DAY_SHORT[g.days[0]]}-${DAY_SHORT[g.days[g.days.length - 1]]}`
        : g.days.map(d => DAY_SHORT[d]).join('/');
    return `${dayStr} ${formatTime(g.start)}-${formatTime(g.end)}`;
  }).join(', ');
}

export default function StaffDirectoryPage() {
  const [staffMembers, setStaffMembers] = useState<StaffWithHours[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffWithHours | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StaffWithHours | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [teachers, setTeachers] = useState<TeacherOption[]>([]);
  const { showToast } = useToast();

  const fetchStaff = async (sid: string) => {
    try {
      setLoading(true);
      setError(null);
      const [data, teacherData] = await Promise.all([
        getSchoolStaffMembers(sid),
        getSchoolTeacherOptions(sid),
      ]);
      setStaffMembers(data);
      setTeachers(teacherData);
    } catch (err) {
      console.error('Error loading staff:', err);
      setError(err instanceof Error ? err.message : 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        const permissions = await getCurrentAdminPermissions();
        const perm = permissions.find(p => p.role === 'site_admin');
        if (!perm?.school_id) {
          setError('No school found for your admin account');
          setLoading(false);
          return;
        }
        setSchoolId(perm.school_id);
        await fetchStaff(perm.school_id);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load permissions');
        setLoading(false);
      }
    };
    init();
  }, []);

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      setDeletingId(confirmDelete.id);
      setConfirmDelete(null);
      await deleteStaffMember(confirmDelete.id);
      setStaffMembers(prev => prev.filter(s => s.id !== confirmDelete.id));
      showToast('Staff member deleted', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete staff member', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredStaff = staffMembers.filter(s => {
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    const role = [ROLE_LABELS[s.role as StaffRole] || s.role, s.role.replace(/_/g, ' ')].join(' ').toLowerCase();
    const room = (s.room_number || '').toLowerCase();
    const teacher = s.teachers ? `${s.teachers.first_name} ${s.teachers.last_name}`.toLowerCase() : '';
    const provider = s.providers ? (s.providers.full_name || '').toLowerCase() : '';
    return name.includes(q) || role.includes(q) || room.includes(q) || teacher.includes(q) || provider.includes(q);
  });

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading staff...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex">
            <svg className="h-5 w-5 text-red-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error loading staff</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff Directory</h1>
            <p className="mt-2 text-gray-600">
              Manage staff members at your school
            </p>
          </div>
          <button
            onClick={() => { setEditingStaff(null); setShowModal(true); }}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Staff
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="p-4 mb-6">
        <div className="relative">
          <label htmlFor="staff-search" className="sr-only">
            Search staff by name, role, room, teacher, or provider
          </label>
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            id="staff-search"
            type="text"
            placeholder="Search by name, role, room, teacher, or provider..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </Card>

      {/* Staff Table */}
      {filteredStaff.length === 0 ? (
        <Card className="p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">No staff found</h3>
          <p className="mt-1 text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search criteria' : 'Get started by adding a staff member'}
          </p>
          {!searchTerm && (
            <div className="mt-6">
              <button
                onClick={() => { setEditingStaff(null); setShowModal(true); }}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <svg className="mr-2 h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Staff
              </button>
            </div>
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Program</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Teacher / Provider</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Room</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Hours</th>
                <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredStaff.map(s => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {s.last_name}, {s.first_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {ROLE_LABELS[s.role as StaffRole] || s.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {s.program || <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {s.teachers
                      ? [s.teachers.last_name, s.teachers.first_name].filter(Boolean).join(', ') || 'Unnamed Teacher'
                      : s.providers
                        ? s.providers.full_name || 'Unnamed Provider'
                        : <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {s.room_number || <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {s.status || <span className="text-gray-400 italic">—</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatHoursSummary(s.staff_hours)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                    <button
                      onClick={() => { setEditingStaff(s); setShowModal(true); }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmDelete(s)}
                      disabled={deletingId === s.id}
                      className="text-red-600 hover:text-red-900 disabled:text-gray-400"
                    >
                      {deletingId === s.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Summary */}
      <div className="mt-6 text-sm text-gray-600">
        Showing {filteredStaff.length} of {staffMembers.length} staff members
      </div>

      {/* Add/Edit Modal */}
      {schoolId && (
        <StaffModal
          isOpen={showModal}
          onClose={() => { setShowModal(false); setEditingStaff(null); }}
          onSuccess={() => {
            setShowModal(false);
            setEditingStaff(null);
            if (schoolId) fetchStaff(schoolId);
            showToast(editingStaff ? 'Staff member updated' : 'Staff member added', 'success');
          }}
          staff={editingStaff}
          schoolId={schoolId}
          teachers={teachers}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete Staff Member"
        message={`Are you sure you want to delete ${confirmDelete?.first_name} ${confirmDelete?.last_name}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
      />
    </div>
  );
}
