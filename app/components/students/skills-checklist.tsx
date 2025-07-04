'use client';

import { useState, useEffect } from 'react';
import { GRADE_SKILLS_CONFIG } from '../../../lib/grade-skills-config';
import { Checkbox } from '../ui/checkbox';

interface SkillsChecklistProps {
  gradeLevel: string;
  selectedSkills: string[];
  onSkillsChange: (skills: string[]) => void;
}

export function SkillsChecklist({ 
  gradeLevel, 
  selectedSkills, 
  onSkillsChange 
}: SkillsChecklistProps) {
  const [expandedCategories, setExpandedCategories] = useState({
    ela: true,
    math: true
  });

  const gradeConfig = GRADE_SKILLS_CONFIG[gradeLevel];

  if (!gradeConfig) {
    return <div className="text-gray-500">No skills configured for this grade level</div>;
  }

  const elaSkills = gradeConfig.skills.filter(skill => skill.category === 'ela');
  const mathSkills = gradeConfig.skills.filter(skill => skill.category === 'math');

  const handleSkillToggle = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      onSkillsChange(selectedSkills.filter(id => id !== skillId));
    } else {
      onSkillsChange([...selectedSkills, skillId]);
    }
  };

  const toggleCategory = (category: 'ela' | 'math') => {
    setExpandedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="space-y-4">
      {/* ELA Skills */}
      <div className="border rounded-lg p-4">
        <button
          type="button"
          onClick={() => toggleCategory('ela')}
          className="flex items-center justify-between w-full text-left"
        >
          <h5 className="font-medium text-gray-900">ELA Skills</h5>
          <span className="text-gray-500">
            {expandedCategories.ela ? '−' : '+'}
          </span>
        </button>

        {expandedCategories.ela && (
          <div className="mt-3 space-y-2">
            {elaSkills.map(skill => (
              <label 
                key={skill.id} 
                className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
              >
                <Checkbox
                  checked={selectedSkills.includes(skill.id)}
                  onCheckedChange={() => handleSkillToggle(skill.id)}
                />
                <span className="text-sm text-gray-700">{skill.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Math Skills */}
      <div className="border rounded-lg p-4">
        <button
          type="button"
          onClick={() => toggleCategory('math')}
          className="flex items-center justify-between w-full text-left"
        >
          <h5 className="font-medium text-gray-900">Math Skills</h5>
          <span className="text-gray-500">
            {expandedCategories.math ? '−' : '+'}
          </span>
        </button>

        {expandedCategories.math && (
          <div className="mt-3 space-y-2">
            {mathSkills.map(skill => (
              <label 
                key={skill.id} 
                className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
              >
                <Checkbox
                  checked={selectedSkills.includes(skill.id)}
                  onCheckedChange={() => handleSkillToggle(skill.id)}
                />
                <span className="text-sm text-gray-700">{skill.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Selected count */}
      <div className="text-sm text-gray-500 text-center">
        {selectedSkills.length} skill{selectedSkills.length !== 1 ? 's' : ''} selected
      </div>
    </div>
  );
}