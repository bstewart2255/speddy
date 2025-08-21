'use client';

import React from 'react';
import { Label } from "../ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { cn } from '@/src/utils/cn';

interface GradeMonthReadingLevelInputProps {
  value?: number | null;
  onChange: (value: number | null) => void;
  className?: string;
}

export function GradeMonthReadingLevelInput({ 
  value, 
  onChange, 
  className 
}: GradeMonthReadingLevelInputProps) {
  const gradeValue = value ? Math.floor(value) : null;
  const monthValue = value ? Math.round((value - Math.floor(value)) * 100) : null;

  const handleGradeChange = (grade: string) => {
    const gradeNum = grade === 'K' ? 0 : parseInt(grade);
    const currentMonth = monthValue || 1;
    onChange(gradeNum + (currentMonth / 100));
  };

  const handleMonthChange = (month: string) => {
    const monthNum = parseInt(month);
    // Validate month is between 1-12
    if (monthNum < 1 || monthNum > 12) {
      console.error('Invalid month value:', monthNum);
      return;
    }
    const currentGrade = gradeValue ?? 0;
    onChange(currentGrade + (monthNum / 100));
  };

  const formatDisplay = () => {
    if (value === null || value === undefined) return "Not assessed";
    const grade = Math.floor(value);
    const month = Math.round((value - grade) * 100);
    // Ensure month is within valid range
    const validMonth = Math.min(12, Math.max(1, month));
    const gradeLabel = grade === 0 ? 'Kindergarten' : `Grade ${grade}`;
    // Format with two decimal places, padding month with leading zero if needed
    const formattedValue = `${grade}.${validMonth.toString().padStart(2, '0')}`;
    return `${gradeLabel}, Month ${validMonth} (${formattedValue})`;
  };

  return (
    <div className={cn("space-y-2", className)}>
      <Label>Reading Level (Grade.Month)</Label>
      <div className="flex gap-2">
        <Select 
          value={gradeValue === 0 ? 'K' : gradeValue?.toString() || ''} 
          onValueChange={handleGradeChange}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Select grade" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="K">Kindergarten</SelectItem>
            <SelectItem value="1">1st Grade</SelectItem>
            <SelectItem value="2">2nd Grade</SelectItem>
            <SelectItem value="3">3rd Grade</SelectItem>
            <SelectItem value="4">4th Grade</SelectItem>
            <SelectItem value="5">5th Grade</SelectItem>
            <SelectItem value="6">6th Grade</SelectItem>
            <SelectItem value="7">7th Grade</SelectItem>
            <SelectItem value="8">8th Grade</SelectItem>
            <SelectItem value="9">9th Grade</SelectItem>
            <SelectItem value="10">10th Grade</SelectItem>
            <SelectItem value="11">11th Grade</SelectItem>
            <SelectItem value="12">12th Grade</SelectItem>
          </SelectContent>
        </Select>

        <Select 
          value={monthValue?.toString() || ''} 
          onValueChange={handleMonthChange}
          disabled={gradeValue === null && gradeValue !== 0}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Month 1</SelectItem>
            <SelectItem value="2">Month 2</SelectItem>
            <SelectItem value="3">Month 3</SelectItem>
            <SelectItem value="4">Month 4</SelectItem>
            <SelectItem value="5">Month 5</SelectItem>
            <SelectItem value="6">Month 6</SelectItem>
            <SelectItem value="7">Month 7</SelectItem>
            <SelectItem value="8">Month 8</SelectItem>
            <SelectItem value="9">Month 9</SelectItem>
            <SelectItem value="10">Month 10</SelectItem>
            <SelectItem value="11">Month 11</SelectItem>
            <SelectItem value="12">Month 12</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-sm text-muted-foreground">
        {formatDisplay()}
      </p>
      <p className="text-xs text-muted-foreground">
        Example: 2nd grade, 5th month = 2.05 | 10th month = 2.10 | Kindergarten, 3rd month = 0.03
      </p>
    </div>
  );
}