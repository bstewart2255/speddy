import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select';

interface SchoolInfo {
  school_id: string;
  school_name: string;
  district_name: string;
  state_abbreviation: string;
}

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

  return (
    <Select value={selectedSchool} onValueChange={onSchoolChange}>
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Select school" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Schools</SelectItem>
        {availableSchools.map((school) => (
          <SelectItem key={school.school_id} value={school.school_id}>
            {school.school_name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}