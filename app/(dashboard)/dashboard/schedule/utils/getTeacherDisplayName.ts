export const getTeacherDisplayName = (teacher: any) =>
  typeof teacher === 'string'
    ? teacher
    : `${teacher.first_name ?? ''} ${teacher.last_name ?? ''}`.trim();
