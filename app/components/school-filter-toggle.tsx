import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';
import type { SchoolInfo } from '@/app/components/providers/school-context';

interface SchoolFilterToggleProps {
  selectedSchool: string;
  availableSchools: SchoolInfo[];
  worksAtMultiple: boolean;
  onSchoolChange: (schoolId: string) => void;
}

export function SchoolFilterToggle({
  selectedSchool,
  availableSchools,
  worksAtMultiple,
  onSchoolChange
}: SchoolFilterToggleProps) {
  // Only show the toggle if user works at multiple schools
  if (!worksAtMultiple || availableSchools.length <= 1) {
    return null;
  }

  // Get the display name for the selected school
  const getSelectedDisplay = () => {
    if (selectedSchool === 'all') {
      return 'All Schools';
    }
    const school = availableSchools.find(
      s => (s.school_id || s.school_site) === selectedSchool
    );
    return school?.display_name || school?.school_site || 'Select school';
  };

  return (
    <Select value={selectedSchool} onValueChange={onSchoolChange}>
      <SelectTrigger className="w-[200px]">
        <span className="block truncate">{getSelectedDisplay()}</span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Schools</SelectItem>
        {availableSchools.map((school) => (
          <SelectItem 
            key={school.school_id || school.school_site} 
            value={school.school_id || school.school_site}
          >
            {school.display_name || school.school_site}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}