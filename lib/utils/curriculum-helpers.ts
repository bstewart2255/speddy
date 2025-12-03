/**
 * Shared curriculum-related helper functions
 * Used across calendar views and session components
 */

interface CurriculumData {
  curriculum_type: string;
  curriculum_level: string;
  current_lesson: number;
}

/**
 * Format curriculum badge text for display
 * @param curriculum - The curriculum data with type, level, and lesson
 * @returns Formatted string like "SPIRE L3.5" or "Reveal G2.10"
 */
export const formatCurriculumBadge = (curriculum: CurriculumData): string => {
  const type = curriculum.curriculum_type === 'SPIRE' ? 'SPIRE' : 'Reveal';
  const level = curriculum.curriculum_type === 'SPIRE'
    ? `L${curriculum.curriculum_level}`
    : `G${curriculum.curriculum_level}`;
  return `${type} ${level}.${curriculum.current_lesson}`;
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
