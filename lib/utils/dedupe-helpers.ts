import crypto from 'crypto';

export interface NormalizedSpecialActivity {
  teacher_name: string;
  activity_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  normalized_key: string;
  content_hash: string;
}

export interface NormalizedBellSchedule {
  grade_level: string;
  period_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  normalized_key: string;
  content_hash: string;
}

function normalizeString(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s'.-]/g, '');
}

function normalizeTime(time: string): string {
  if (typeof time !== 'string' || !time.trim()) {
    return '00:00:00';
  }
  // Match HH:MM or HH:MM:SS, allowing single or double digit hours/minutes/seconds
  const match = time.trim().match(/^(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?$/);
  if (!match) {
    return '00:00:00';
  }
  const hours = match[1].padStart(2, '0');
  const minutes = (match[2] || '00').padStart(2, '0');
  const seconds = (match[3] || '00').padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function generateContentHash(obj: any): string {
  const str = JSON.stringify(obj, Object.keys(obj).sort());
  return crypto.createHash('sha256').update(str).digest('hex');
}

export function normalizeSpecialActivity(activity: any): NormalizedSpecialActivity {
  const normalized = {
    teacher_name: activity.teacher_name?.trim() || '',
    activity_name: activity.activity_name?.trim() || '',
    day_of_week: parseInt(activity.day_of_week) || 1,
    start_time: normalizeTime(activity.start_time || ''),
    end_time: normalizeTime(activity.end_time || ''),
  };

  const normalizedKey = [
    normalizeString(normalized.teacher_name),
    normalizeString(normalized.activity_name),
    normalized.day_of_week,
    normalized.start_time,
  ].join('|');

  return {
    ...normalized,
    normalized_key: normalizedKey,
    content_hash: generateContentHash(normalized),
  };
}

export function normalizeBellSchedule(schedule: any): NormalizedBellSchedule {
  const normalized = {
    grade_level: schedule.grade_level?.toString().toUpperCase().trim() || '',
    period_name: schedule.period_name?.trim() || '',
    day_of_week: parseInt(schedule.day_of_week) || 1,
    start_time: normalizeTime(schedule.start_time || ''),
    end_time: normalizeTime(schedule.end_time || ''),
  };

  const normalizedKey = [
    normalized.grade_level,
    normalizeString(normalized.period_name),
    normalized.day_of_week,
    normalized.start_time,
  ].join('|');

  return {
    ...normalized,
    normalized_key: normalizedKey,
    content_hash: generateContentHash(normalized),
  };
}

export function dedupeSpecialActivities(activities: any[]): NormalizedSpecialActivity[] {
  const seen = new Map<string, NormalizedSpecialActivity>();
  
  for (const activity of activities) {
    const normalized = normalizeSpecialActivity(activity);
    if (!seen.has(normalized.normalized_key)) {
      seen.set(normalized.normalized_key, normalized);
    }
  }
  
  return Array.from(seen.values());
}

export function dedupeBellSchedules(schedules: any[]): NormalizedBellSchedule[] {
  const seen = new Map<string, NormalizedBellSchedule>();
  
  for (const schedule of schedules) {
    const normalized = normalizeBellSchedule(schedule);
    if (!seen.has(normalized.normalized_key)) {
      seen.set(normalized.normalized_key, normalized);
    }
  }
  
  return Array.from(seen.values());
}

export interface ImportSummary {
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: Array<{ item: any; error: string }>;
}

export function createImportSummary(): ImportSummary {
  return {
    total: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  };
}