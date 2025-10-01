import type { Database } from '@/src/types/database';

export type Teacher = Database['public']['Tables']['teachers']['Row'];

export type TeacherLike = string | Pick<Teacher, 'first_name' | 'last_name'>;