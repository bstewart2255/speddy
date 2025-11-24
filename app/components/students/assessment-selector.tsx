'use client';

import React, { useState, useEffect } from 'react';
import {
  createAssessment,
  updateAssessment,
} from '../../../lib/supabase/queries/student-assessments';
import type {
  StudentAssessment,
  AssessmentType,
  AssessmentData,
} from '../../../types/student-assessments';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '../ui/card';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Input } from '../ui/input';
import { ArrowLeft } from 'lucide-react';
import MClassInputs from './assessments/mclass-inputs';
import StarReadingInputs from './assessments/star-reading-inputs';
import StarMathInputs from './assessments/star-math-inputs';
import WiscVInputs from './assessments/wisc-v-inputs';
import BriefInputs from './assessments/brief-inputs';

interface AssessmentSelectorProps {
  studentId: string;
  existingAssessment?: StudentAssessment | null;
  onClose: () => void;
}

const ASSESSMENT_OPTIONS: { value: AssessmentType; label: string }[] = [
  { value: 'mclass', label: 'mClass (DIBELS)' },
  { value: 'star_reading', label: 'STAR Reading' },
  { value: 'star_math', label: 'STAR Math' },
  { value: 'wisc_v', label: 'WISC-V' },
  { value: 'brief', label: 'BRIEF (Executive Function)' },
];

export default function AssessmentSelector({
  studentId,
  existingAssessment,
  onClose,
}: AssessmentSelectorProps) {
  const [assessmentType, setAssessmentType] = useState<AssessmentType | ''>('');
  const [assessmentDate, setAssessmentDate] = useState('');
  const [assessmentData, setAssessmentData] = useState<AssessmentData>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingAssessment) {
      setAssessmentType(existingAssessment.assessmentType);
      setAssessmentDate(existingAssessment.assessmentDate);
      setAssessmentData(existingAssessment.data);
    } else {
      // Default to today's date
      setAssessmentDate(new Date().toISOString().split('T')[0]);
    }
  }, [existingAssessment]);

  const handleSave = async () => {
    if (!assessmentType || !assessmentDate) {
      alert('Please select an assessment type and date.');
      return;
    }

    try {
      setSaving(true);

      if (existingAssessment) {
        // Update existing assessment
        await updateAssessment({
          id: existingAssessment.id,
          assessmentType: assessmentType as AssessmentType,
          assessmentDate,
          data: assessmentData,
        });
      } else {
        // Create new assessment
        await createAssessment({
          studentId,
          assessmentType: assessmentType as AssessmentType,
          assessmentDate,
          data: assessmentData,
        });
      }

      onClose();
    } catch (error) {
      console.error('Error saving assessment:', error);
      alert('Failed to save assessment. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderToolInputs = () => {
    if (!assessmentType) {
      return (
        <div className="text-center py-8 text-gray-500">
          Select an assessment type to begin
        </div>
      );
    }

    const props = {
      data: assessmentData,
      onChange: setAssessmentData,
    };

    switch (assessmentType) {
      case 'mclass':
        return <MClassInputs {...props} />;
      case 'star_reading':
        return <StarReadingInputs {...props} />;
      case 'star_math':
        return <StarMathInputs {...props} />;
      case 'wisc_v':
        return <WiscVInputs {...props} />;
      case 'brief':
        return <BriefInputs {...props} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to List
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {existingAssessment ? 'Edit Assessment' : 'Add New Assessment'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Assessment Type Selector */}
          <div className="space-y-2">
            <Label htmlFor="assessment-type">Assessment Type</Label>
            <Select
              value={assessmentType}
              onValueChange={(value) => setAssessmentType(value as AssessmentType)}
              disabled={!!existingAssessment} // Can't change type when editing
            >
              <SelectTrigger id="assessment-type">
                <SelectValue placeholder="Select assessment type" />
              </SelectTrigger>
              <SelectContent>
                {ASSESSMENT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Assessment Date */}
          <div className="space-y-2">
            <Label htmlFor="assessment-date">Assessment Date</Label>
            <Input
              id="assessment-date"
              type="date"
              value={assessmentDate}
              onChange={(e) => setAssessmentDate(e.target.value)}
            />
          </div>

          {/* Tool-specific inputs */}
          <div className="border-t pt-6">{renderToolInputs()}</div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !assessmentType || !assessmentDate}>
            {saving ? 'Saving...' : existingAssessment ? 'Update Assessment' : 'Save Assessment'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
