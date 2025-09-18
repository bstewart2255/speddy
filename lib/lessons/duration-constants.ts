// Shared constants for duration-based content scaling

export const DURATION_MULTIPLIERS = [
  { maxDuration: 15, multiplier: 1 },
  { maxDuration: 30, multiplier: 1.5 },
  { maxDuration: 45, multiplier: 2 },
  { maxDuration: Infinity, multiplier: 2.5 }, // 60+ minutes
];

export const WHITEBOARD_EXAMPLE_COUNTS = [
  { maxDuration: 15, min: 2, max: 2 },
  { maxDuration: 30, min: 2, max: 3 },
  { maxDuration: 45, min: 3, max: 4 },
  { maxDuration: Infinity, min: 4, max: 5 }, // 60+ minutes
];

export function getDurationMultiplier(duration: number): number {
  for (const { maxDuration, multiplier } of DURATION_MULTIPLIERS) {
    if (duration <= maxDuration) {
      return multiplier;
    }
  }
  return 2.5; // Default for very long lessons
}

export function getWhiteboardExampleRange(duration: number): { min: number; max: number } {
  for (const { maxDuration, min, max } of WHITEBOARD_EXAMPLE_COUNTS) {
    if (duration <= maxDuration) {
      return { min, max };
    }
  }
  return { min: 4, max: 5 }; // Default for very long lessons
}

// Base minimum problem counts by grade level
export const BASE_PROBLEM_COUNTS = {
  K2: { min: 6, max: 8 }, // Grades K-2
  THREE_FIVE: { min: 8, max: 12 }, // Grades 3-5
};

export function getBaseMinimum(maxGrade: number): number {
  return maxGrade <= 2 ? BASE_PROBLEM_COUNTS.K2.min : BASE_PROBLEM_COUNTS.THREE_FIVE.min;
}

export function getBaseMaximum(maxGrade: number): number {
  return maxGrade <= 2 ? BASE_PROBLEM_COUNTS.K2.max : BASE_PROBLEM_COUNTS.THREE_FIVE.max;
}