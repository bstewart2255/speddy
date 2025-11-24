'use client';

import React from 'react';
import type { StarReadingAssessmentData } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface StarReadingInputsProps {
  data: StarReadingAssessmentData;
  onChange: (data: StarReadingAssessmentData) => void;
}

export default function StarReadingInputs({ data, onChange }: StarReadingInputsProps) {
  const updateField = (field: keyof StarReadingAssessmentData, value: any) => {
    onChange({
      ...data,
      [field]: value === '' ? undefined : value,
    });
  };

  const parseNumber = (value: string): number | undefined => {
    if (!value) return undefined;
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">STAR Reading Scores</h4>
        <p className="text-xs text-gray-500">Enter scores as shown in Renaissance reports</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="gradePlacement">GP (Grade Placement)</Label>
            <Input
              id="gradePlacement"
              type="text"
              value={data.gradePlacement ?? ''}
              onChange={(e) => updateField('gradePlacement', e.target.value)}
              placeholder="e.g., 3.5"
            />
            <p className="text-xs text-gray-500">Current grade placement</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="scaledScore">Score (Scaled Score)</Label>
            <Input
              id="scaledScore"
              type="number"
              value={data.scaledScore ?? ''}
              onChange={(e) => updateField('scaledScore', parseNumber(e.target.value))}
              placeholder="e.g., 966"
            />
            <p className="text-xs text-gray-500">STAR Reading scaled score (0-1400)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gradeEquivalent">GE (Grade Equivalent)</Label>
            <Input
              id="gradeEquivalent"
              type="text"
              value={data.gradeEquivalent ?? ''}
              onChange={(e) => updateField('gradeEquivalent', e.target.value)}
              placeholder="e.g., 3.2"
            />
            <p className="text-xs text-gray-500">Grade equivalent score</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="percentileRank">PR (Percentile Rank)</Label>
            <Input
              id="percentileRank"
              type="number"
              min="1"
              max="99"
              value={data.percentileRank ?? ''}
              onChange={(e) => updateField('percentileRank', parseNumber(e.target.value))}
              placeholder="e.g., 49"
            />
            <p className="text-xs text-gray-500">Percentile rank (1-99)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="normalCurveEquivalent">NCE (Normal Curve Equivalent)</Label>
            <Input
              id="normalCurveEquivalent"
              type="number"
              value={data.normalCurveEquivalent ?? ''}
              onChange={(e) => updateField('normalCurveEquivalent', parseNumber(e.target.value))}
              placeholder="e.g., 49.5"
            />
            <p className="text-xs text-gray-500">Normal curve equivalent</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="instructionalReadingLevel">IRL (Instructional Reading Level)</Label>
            <Input
              id="instructionalReadingLevel"
              type="text"
              value={data.instructionalReadingLevel ?? ''}
              onChange={(e) => updateField('instructionalReadingLevel', e.target.value)}
              placeholder="e.g., 3.8"
            />
            <p className="text-xs text-gray-500">Instructional reading level</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimatedOralReadingFluency">Est. ORF (Oral Reading Fluency)</Label>
            <Input
              id="estimatedOralReadingFluency"
              type="number"
              value={data.estimatedOralReadingFluency ?? ''}
              onChange={(e) => updateField('estimatedOralReadingFluency', parseNumber(e.target.value))}
              placeholder="e.g., 105"
            />
            <p className="text-xs text-gray-500">Estimated oral reading fluency (words per minute)</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>ZPD (Zone of Proximal Development)</Label>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Input
                id="zpdLow"
                type="text"
                value={data.zpdLow ?? ''}
                onChange={(e) => updateField('zpdLow', e.target.value)}
                placeholder="e.g., 3.1"
              />
              <p className="text-xs text-gray-500">ZPD lower bound</p>
            </div>
            <div className="space-y-2">
              <Input
                id="zpdHigh"
                type="text"
                value={data.zpdHigh ?? ''}
                onChange={(e) => updateField('zpdHigh', e.target.value)}
                placeholder="e.g., 4.7"
              />
              <p className="text-xs text-gray-500">ZPD upper bound</p>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (Optional)</Label>
        <Textarea
          id="notes"
          value={data.notes ?? ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Add any additional notes about this assessment..."
          rows={3}
        />
      </div>
    </div>
  );
}
