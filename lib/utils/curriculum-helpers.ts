/**
 * Shared curriculum-related helper functions
 * Used across calendar views and session components
 */

import { getCurriculumByTrackingValue } from '@/lib/curriculums/catalog';

interface CurriculumData {
  curriculum_type: string;
  curriculum_level: string;
  current_lesson: number;
}

/**
 * Format curriculum badge text for display
 * @param curriculum - The curriculum data with type, level, and lesson
 * @returns Formatted string like "SPIRE L3.5", "Reveal G2.10", or "Wilson Step 4.3"
 */
export const formatCurriculumBadge = (curriculum: CurriculumData): string => {
  const entry = getCurriculumByTrackingValue(curriculum.curriculum_type);
  const badge = entry?.badge ?? curriculum.curriculum_type;
  const level = curriculum.curriculum_level;
  // Prefix compact levels only ("L3", "GK"); wordy ones ("Foundations",
  // "Step 4") read as names and stay bare.
  const levelText =
    entry?.levels && level.length <= 2 ? `${entry.levels.badgePrefix}${level}` : level;
  return `${badge} ${levelText}.${curriculum.current_lesson}`;
};

/**
 * Get first curriculum from array (Supabase returns array for LEFT JOIN)
 * @param curriculumArray - Array of curriculum data or null/undefined
 * @returns First curriculum item or null if none exists
 */
export const getFirstCurriculum = (
  curriculumArray: CurriculumData[] | null | undefined
): CurriculumData | null => {
  return curriculumArray && curriculumArray.length > 0 ? curriculumArray[0] : null;
};
