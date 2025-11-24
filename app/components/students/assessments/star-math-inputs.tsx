'use client';

import React from 'react';
import type { StarMathAssessmentData } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface StarMathInputsProps {
  data: StarMathAssessmentData;
  onChange: (data: StarMathAssessmentData) => void;
}

export default function StarMathInputs({ data, onChange }: StarMathInputsProps) {
  const updateField = (field: keyof StarMathAssessmentData, value: any) => {
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
        <h4 className="font-medium text-sm text-gray-700">STAR Math Scores</h4>
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
              placeholder="e.g., 850"
            />
            <p className="text-xs text-gray-500">STAR Math scaled score (0-1400)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quantileMeasure">Quantile Measure</Label>
            <Input
              id="quantileMeasure"
              type="text"
              value={data.quantileMeasure ?? ''}
              onChange={(e) => updateField('quantileMeasure', e.target.value)}
              placeholder="e.g., 550Q"
            />
            <p className="text-xs text-gray-500">Quantile measure for math skills</p>
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
