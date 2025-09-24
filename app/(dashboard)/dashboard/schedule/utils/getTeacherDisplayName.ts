import type { TeacherLike } from '../types/teacher';

export const getTeacherDisplayName = (teacher: TeacherLike) =>
  typeof teacher === 'string'
    ? teacher
    : `${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim();
