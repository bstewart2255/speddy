/**
 * Shared fallback passages for reading fluency assessments
 *
 * Used when AI generation fails or API key is not configured.
 * Passages are grade-level appropriate for oral reading assessment.
 */

/**
 * Generate a fallback fluency passage based on grade level
 */
export function generateFallbackFluencyPassage(gradeLevel: number): string {
  if (gradeLevel <= 2) {
    return `The sun came up over the farm. A little bird woke up in its nest. It was time to find food. The bird flew down to the ground. It found a worm near the fence. The bird was happy. It flew back to the nest to eat. What a good morning!`;
  } else if (gradeLevel <= 4) {
    return `Deep in the forest, a family of deer made their home near a quiet stream. Every morning, they would walk to the water to drink. The youngest deer liked to splash in the shallow parts. One day, the deer found a new path through the trees. They followed it and discovered a meadow full of wildflowers. The deer spent the whole afternoon exploring their new favorite spot.`;
  } else {
    return `Scientists recently discovered a remarkable species of octopus living in the deep ocean. Unlike most octopuses that prefer warm, shallow waters, this creature thrives in freezing temperatures near underwater volcanoes. The octopus has developed special proteins in its blood that prevent it from freezing. Researchers believe studying this adaptation could lead to breakthroughs in medicine and technology. The discovery reminds us how much we still have to learn about life in Earth's oceans.`;
  }
}
