export interface Teacher {
  id: string;
  provider_id: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  school_id?: string | null;
}

export type TeacherLike = string | Pick<Teacher, 'first_name' | 'last_name'>;