/**
 * Type definitions for lesson content and related structures
 *
 * These types provide proper typing for lesson JSON content fields
 * stored in the database, eliminating the need for 'as any' casts.
 */

/**
 * Represents a single activity within a lesson
 */
export interface Activity {
  /** Title of the activity */
  title: string;
  /** Duration in minutes (optional) */
  duration?: number;
  /** Detailed description of the activity */
  description: string;
  /** Additional materials needed for this specific activity */
  materials?: string[];
  /** Instructions for the activity */
  instructions?: string;
}

/**
 * Represents the full content structure of a lesson
 *
 * This matches the JSON structure stored in lessons.content field
 */
export interface LessonContent {
  /** Learning objectives for the lesson */
  objectives?: string;
  /** Materials needed for the lesson */
  materials?: string;
  /** Activities - can be a JSON string or array of Activity objects */
  activities?: string | Activity[];
  /** Assessment methods for the lesson */
  assessment?: string;
  /** Introduction or warm-up section */
  introduction?: string;
  /** Main instruction section */
  instruction?: string;
  /** Practice or application section */
  practice?: string;
  /** Closure or wrap-up section */
  closure?: string;
  /** Additional notes or instructions */
  notes?: string;
}

/**
 * Type guard to check if activities is an Activity array
 */
export function isActivityArray(activities: string | Activity[] | undefined): activities is Activity[] {
  return Array.isArray(activities);
}

/**
 * Helper to safely parse activities from a lesson content
 */
export function parseActivities(content: LessonContent): Activity[] {
  if (!content.activities) return [];

  if (isActivityArray(content.activities)) {
    return content.activities;
  }

  // Try to parse as JSON string
  try {
    const parsed = JSON.parse(content.activities);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Helper to safely stringify activities for storage
 */
export function stringifyActivities(activities: Activity[]): string {
  return JSON.stringify(activities);
}
