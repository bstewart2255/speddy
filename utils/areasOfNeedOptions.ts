import { GRADE_SKILLS_CONFIG } from '../lib/grade-skills-config';

export interface CrossGradeSkill {
  id: string;
  label: string;
  category: 'math' | 'ela' | 'both';
  trimester?: 'beginning' | 'middle' | 'end';
  gradeLevel: string;  // Made required for CrossGradeSkill
  gradeLabel: string;
  displayLabel: string;
}

export function getSkillsForGradeTransition(currentGrade: string): CrossGradeSkill[] {
  const skills: CrossGradeSkill[] = [];
  
  const gradeOrder = ['K', '1', '2', '3', '4', '5'];
  const currentGradeIndex = gradeOrder.indexOf(currentGrade);
  
  if (currentGradeIndex === -1) {
    return skills;
  }
  
  if (currentGradeIndex > 0) {
    const previousGrade = gradeOrder[currentGradeIndex - 1];
    const previousGradeConfig = GRADE_SKILLS_CONFIG[previousGrade];
    
    if (previousGradeConfig) {
      const endOfYearSkills: CrossGradeSkill[] = previousGradeConfig.skills
        .filter(skill => skill.trimester === 'end')
        .map(skill => ({
          id: skill.id,
          label: skill.label,
          category: skill.category,
          trimester: skill.trimester,
          gradeLevel: previousGrade,
          gradeLabel: `${previousGradeConfig.label} - End of Year`,
          displayLabel: `${skill.label} (${previousGradeConfig.label} - End)`
        }));
      
      skills.push(...endOfYearSkills);
    }
  }
  
  const currentGradeConfig = GRADE_SKILLS_CONFIG[currentGrade];
  if (currentGradeConfig) {
    const beginningSkills: CrossGradeSkill[] = currentGradeConfig.skills
      .filter(skill => skill.trimester === 'beginning')
      .map(skill => ({
        id: skill.id,
        label: skill.label,
        category: skill.category,
        trimester: skill.trimester,
        gradeLevel: currentGrade,
        gradeLabel: `${currentGradeConfig.label} - Beginning of Year`,
        displayLabel: `${skill.label} (${currentGradeConfig.label} - Beginning)`
      }));
    
    const middleSkills: CrossGradeSkill[] = currentGradeConfig.skills
      .filter(skill => skill.trimester === 'middle')
      .map(skill => ({
        id: skill.id,
        label: skill.label,
        category: skill.category,
        trimester: skill.trimester,
        gradeLevel: currentGrade,
        gradeLabel: `${currentGradeConfig.label} - Middle of Year`,
        displayLabel: `${skill.label} (${currentGradeConfig.label} - Middle)`
      }));
    
    const endSkills: CrossGradeSkill[] = currentGradeConfig.skills
      .filter(skill => skill.trimester === 'end')
      .map(skill => ({
        id: skill.id,
        label: skill.label,
        category: skill.category,
        trimester: skill.trimester,
        gradeLevel: currentGrade,
        gradeLabel: `${currentGradeConfig.label} - End of Year`,
        displayLabel: `${skill.label} (${currentGradeConfig.label} - End)`
      }));
    
    skills.push(...beginningSkills, ...middleSkills, ...endSkills);
  }
  
  return skills;
}

export function getAllSkillsForGrade(grade: string): CrossGradeSkill[] {
  const gradeConfig = GRADE_SKILLS_CONFIG[grade];
  
  if (!gradeConfig) {
    return [];
  }
  
  return gradeConfig.skills.map(skill => ({
    id: skill.id,
    label: skill.label,
    category: skill.category,
    trimester: skill.trimester,
    gradeLevel: grade,
    gradeLabel: gradeConfig.label,
    displayLabel: skill.label
  }));
}

export function getSkillsByIds(skillIds: string[]): CrossGradeSkill[] {
  const skills: CrossGradeSkill[] = [];
  
  Object.entries(GRADE_SKILLS_CONFIG).forEach(([grade, gradeConfig]) => {
    gradeConfig.skills.forEach(skill => {
      if (skillIds.includes(skill.id)) {
        skills.push({
          id: skill.id,
          label: skill.label,
          category: skill.category,
          trimester: skill.trimester,
          gradeLevel: grade,
          gradeLabel: gradeConfig.label,
          displayLabel: skill.label
        });
      }
    });
  });
  
  return skills;
}

export function getSuggestedSkillCombinations(currentGrade: string): { label: string; skills: string[] }[] {
  const suggestions: { label: string; skills: string[] }[] = [];
  const gradeOrder = ['K', '1', '2', '3', '4', '5'];
  const currentGradeIndex = gradeOrder.indexOf(currentGrade);
  
  if (currentGradeIndex === -1) {
    return suggestions;
  }
  
  if (currentGradeIndex > 0) {
    const previousGrade = gradeOrder[currentGradeIndex - 1];
    const previousGradeConfig = GRADE_SKILLS_CONFIG[previousGrade];
    const currentGradeConfig = GRADE_SKILLS_CONFIG[currentGrade];
    
    if (previousGradeConfig && currentGradeConfig) {
      const endOfPreviousYearSkills = previousGradeConfig.skills
        .filter(skill => skill.trimester === 'end')
        .map(skill => skill.id);
      
      const beginningOfCurrentYearSkills = currentGradeConfig.skills
        .filter(skill => skill.trimester === 'beginning')
        .map(skill => skill.id);
      
      suggestions.push({
        label: `Transition: ${previousGradeConfig.label} to ${currentGradeConfig.label}`,
        skills: [...endOfPreviousYearSkills, ...beginningOfCurrentYearSkills]
      });
    }
  }
  
  const currentGradeConfig = GRADE_SKILLS_CONFIG[currentGrade];
  if (currentGradeConfig) {
    const beginningSkills = currentGradeConfig.skills
      .filter(skill => skill.trimester === 'beginning')
      .map(skill => skill.id);
    
    const middleSkills = currentGradeConfig.skills
      .filter(skill => skill.trimester === 'middle')
      .map(skill => skill.id);
    
    const endSkills = currentGradeConfig.skills
      .filter(skill => skill.trimester === 'end')
      .map(skill => skill.id);
    
    suggestions.push({
      label: `${currentGradeConfig.label} - Beginning of Year Focus`,
      skills: beginningSkills
    });
    
    suggestions.push({
      label: `${currentGradeConfig.label} - Middle of Year Focus`,
      skills: middleSkills
    });
    
    suggestions.push({
      label: `${currentGradeConfig.label} - End of Year Focus`,
      skills: endSkills
    });
  }
  
  return suggestions;
}