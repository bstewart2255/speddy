'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check } from 'lucide-react';
import { 
  getSkillsForGradeTransition, 
  getSuggestedSkillCombinations,
  getSkillsByIds,
  CrossGradeSkill
} from '../../../utils/areasOfNeedOptions';

interface AreasOfNeedDropdownProps {
  gradeLevel: string;
  selectedSkills: string[];
  onSkillsChange: (skills: string[]) => void;
}

export function AreasOfNeedDropdown({
  gradeLevel,
  selectedSkills,
  onSkillsChange
}: AreasOfNeedDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'suggestions'>('all');
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const allSkills = getSkillsForGradeTransition(gradeLevel);
  const suggestions = getSuggestedSkillCombinations(gradeLevel);
  const selectedSkillDetails = getSkillsByIds(selectedSkills);
  
  const filteredSkills = allSkills.filter(skill =>
    skill.displayLabel.toLowerCase().includes(searchTerm.toLowerCase()) ||
    skill.gradeLabel.toLowerCase().includes(searchTerm.toLowerCase())
  );
  
  const groupedSkills = filteredSkills.reduce((acc, skill) => {
    if (!acc[skill.gradeLabel]) {
      acc[skill.gradeLabel] = [];
    }
    acc[skill.gradeLabel].push(skill);
    return acc;
  }, {} as Record<string, CrossGradeSkill[]>);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  const handleSkillToggle = (skillId: string) => {
    if (selectedSkills.includes(skillId)) {
      onSkillsChange(selectedSkills.filter(id => id !== skillId));
    } else {
      onSkillsChange([...selectedSkills, skillId]);
    }
  };
  
  const handleSuggestionSelect = (skillIds: string[]) => {
    const newSkills = new Set([...selectedSkills, ...skillIds]);
    onSkillsChange(Array.from(newSkills));
  };
  
  const handleRemoveSkill = (skillId: string) => {
    onSkillsChange(selectedSkills.filter(id => id !== skillId));
  };
  
  const clearAll = () => {
    onSkillsChange([]);
  };
  
  return (
    <div className="relative" ref={dropdownRef}>
      {/* Selected Skills Display */}
      <div className="mb-2">
        {selectedSkillDetails.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedSkillDetails.map(skill => (
              <span
                key={skill.id}
                className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-blue-100 text-blue-800"
              >
                {skill.displayLabel}
                <button
                  type="button"
                  onClick={() => handleRemoveSkill(skill.id)}
                  className="ml-1 hover:text-blue-600"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Dropdown Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-left flex items-center justify-between hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className="text-gray-700">
          {selectedSkills.length === 0
            ? 'Select areas of need...'
            : `${selectedSkills.length} area${selectedSkills.length !== 1 ? 's' : ''} selected`}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-hidden">
          {/* Search Bar */}
          <div className="p-3 border-b">
            <input
              type="text"
              placeholder="Search skills..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          
          {/* Tabs */}
          <div className="flex border-b">
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activeTab === 'all'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              All Skills
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('suggestions')}
              className={`flex-1 px-4 py-2 text-sm font-medium ${
                activeTab === 'suggestions'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Suggestions
            </button>
          </div>
          
          {/* Content */}
          <div className="max-h-64 overflow-y-auto">
            {activeTab === 'all' ? (
              <div className="p-2">
                {Object.entries(groupedSkills).map(([gradeLabel, skills]) => (
                  <div key={gradeLabel} className="mb-4">
                    <h4 className="text-sm font-semibold text-gray-700 px-2 py-1 bg-gray-50 rounded">
                      {gradeLabel}
                    </h4>
                    <div className="mt-1 space-y-1">
                      {skills.map(skill => (
                        <label
                          key={skill.id}
                          className="flex items-center px-2 py-1.5 hover:bg-gray-50 rounded cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedSkills.includes(skill.id)}
                            onChange={() => handleSkillToggle(skill.id)}
                            className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 flex-1">{skill.label}</span>
                          <span className="text-xs text-gray-500 ml-2">
                            {skill.category === 'ela' ? 'ELA' : 'Math'}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-2">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={index}
                    className="mb-3 p-3 border border-gray-200 rounded-md hover:bg-gray-50"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-gray-700">
                        {suggestion.label}
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleSuggestionSelect(suggestion.skills)}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Add All
                      </button>
                    </div>
                    <div className="text-xs text-gray-600">
                      {suggestion.skills.length} skills
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Footer */}
          <div className="p-2 border-t bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {selectedSkills.length} selected
            </span>
            <button
              type="button"
              onClick={clearAll}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}