'use client';

import { GRADE_SKILLS_CONFIG } from '../../../lib/grade-skills-config';

interface SkillsDisplayProps {
  gradeLevel: string;
  selectedSkillIds: string[];
  compact?: boolean;
}

export function SkillsDisplay({ gradeLevel, selectedSkillIds, compact = false }: SkillsDisplayProps) {
  const gradeConfig = GRADE_SKILLS_CONFIG[gradeLevel];

  if (!gradeConfig || selectedSkillIds.length === 0) {
    return null;
  }

  // Get skill objects for selected IDs
  const selectedSkills = gradeConfig.skills.filter(skill => 
    selectedSkillIds.includes(skill.id)
  );

  const elaSkills = selectedSkills.filter(skill => skill.category === 'ela');
  const mathSkills = selectedSkills.filter(skill => skill.category === 'math');

  if (compact) {
    // Compact view for summary display
    return (
      <div className="text-sm text-gray-600">
        <span className="font-medium">Working on:</span>{' '}
        {elaSkills.length > 0 && (
          <span className="text-blue-600">ELA ({elaSkills.length})</span>
        )}
        {elaSkills.length > 0 && mathSkills.length > 0 && ' • '}
        {mathSkills.length > 0 && (
          <span className="text-green-600">Math ({mathSkills.length})</span>
        )}
      </div>
    );
  }

  // Full view with skill details
  return (
    <div className="space-y-3">
      {elaSkills.length > 0 && (
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-1">ELA Skills:</h5>
          <ul className="list-disc list-inside space-y-1">
            {elaSkills.map(skill => (
              <li key={skill.id} className="text-sm text-gray-600">
                {skill.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      {mathSkills.length > 0 && (
        <div>
          <h5 className="text-sm font-medium text-gray-700 mb-1">Math Skills:</h5>
          <ul className="list-disc list-inside space-y-1">
            {mathSkills.map(skill => (
              <li key={skill.id} className="text-sm text-gray-600">
                {skill.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}