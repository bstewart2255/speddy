'use client';

import React, { useMemo } from 'react';
import { Button } from '../../../../../components/ui/button';
import { SidebarSection } from './sidebar-section';
import type { Teacher, YardDutyAssignment } from '@/src/types/database';

interface TeacherPanelProps {
  teachers: Teacher[];
  selectedTeacherIds: Set<string>;
  onToggleTeacher: (teacherId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  yardDutyAssignments?: YardDutyAssignment[];
}

export function TeacherPanel({
  teachers,
  selectedTeacherIds,
  onToggleTeacher,
  onSelectAll,
  onDeselectAll,
  yardDutyAssignments = []
}: TeacherPanelProps) {
  // Calculate total weekly yard duty minutes per teacher
  const yardDutyMinutesByTeacher = useMemo(() => {
    const map = new Map<string, number>();
    for (const yd of yardDutyAssignments) {
      if (!yd.teacher_id) continue;
      const [sh, sm] = yd.start_time.split(':').map(Number);
      const [eh, em] = yd.end_time.split(':').map(Number);
      const minutes = (eh * 60 + em) - (sh * 60 + sm);
      if (minutes > 0) {
        map.set(yd.teacher_id, (map.get(yd.teacher_id) || 0) + minutes);
      }
    }
    return map;
  }, [yardDutyAssignments]);

  const formatTeacherName = (teacher: Teacher): string => {
    if (teacher.first_name && teacher.last_name) {
      return `${teacher.first_name} ${teacher.last_name}`;
    }
    if (teacher.last_name) {
      return teacher.last_name;
    }
    if (teacher.first_name) {
      return teacher.first_name;
    }
    return 'Unknown';
  };

  const allSelected = teachers.length > 0 && selectedTeacherIds.size === teachers.length;
  const noneSelected = selectedTeacherIds.size === 0;

  return (
    <SidebarSection title="Teachers" count={teachers.length} defaultOpen={true}>
      {/* Action buttons */}
      <div className="flex gap-2 mb-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={onSelectAll}
          disabled={allSelected}
          className="flex-1 text-xs"
        >
          Select All
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onDeselectAll}
          disabled={noneSelected}
          className="flex-1 text-xs"
        >
          Clear
        </Button>
      </div>

      {/* Help text */}
      <p className="text-xs text-gray-500 mb-3">
        {noneSelected
          ? 'Showing all activities. Select teachers to filter.'
          : `Showing activities for ${selectedTeacherIds.size} teacher${selectedTeacherIds.size !== 1 ? 's' : ''}`
        }
      </p>

      {/* Teacher list */}
      <div className="space-y-1 max-h-96 overflow-y-auto">
        {teachers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No teachers found
          </p>
        ) : (
          teachers.map((teacher) => (
            <label
              key={teacher.id}
              className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedTeacherIds.has(teacher.id)}
                onChange={() => onToggleTeacher(teacher.id)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                aria-label={formatTeacherName(teacher)}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">
                  {formatTeacherName(teacher)}
                </div>
                {teacher.classroom_number && (
                  <div className="text-xs text-gray-500 truncate">
                    Room {teacher.classroom_number}
                  </div>
                )}
              </div>
              {yardDutyMinutesByTeacher.has(teacher.id) && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                  {yardDutyMinutesByTeacher.get(teacher.id)}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </SidebarSection>
  );
}
