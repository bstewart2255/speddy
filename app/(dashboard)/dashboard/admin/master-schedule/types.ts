// Extended bell schedule type that includes creator info from getBellSchedulesForSchool
export interface BellScheduleWithCreator {
  id: string;
  grade_level: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  period_name: string | null;
  provider_id: string | null;
  school_id: string | null;
  created_by_id: string | null;
  created_by_role: string | null;
  created_at: string | null;
  updated_at: string | null;
  creator_name: string;
  is_owner: boolean;
}
