'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import type { Teacher } from '@/src/types/database';

interface TeacherPanelProps {
  teachers: Teacher[];
  selectedTeacherIds: Set<string>;
  onToggleTeacher: (teacherId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function TeacherPanel({
  teachers,
  selectedTeacherIds,
  onToggleTeacher,
  onSelectAll,
  onDeselectAll
}: TeacherPanelProps) {
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
    <Card className="sticky top-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Teachers</CardTitle>
      </CardHeader>
      <CardBody className="pt-0">
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
              </label>
            ))
          )}
        </div>
      </CardBody>
    </Card>
  );
}
