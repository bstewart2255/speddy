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

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Overall Performance</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="scaledScore">Scaled Score</Label>
            <Input
              id="scaledScore"
              type="number"
              value={data.scaledScore ?? ''}
              onChange={(e) => updateField('scaledScore', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-1400"
            />
            <p className="text-xs text-gray-500">STAR Math scaled scores range from 0-1400</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="percentileRank">Percentile Rank</Label>
            <Input
              id="percentileRank"
              type="number"
              min="1"
              max="99"
              value={data.percentileRank ?? ''}
              onChange={(e) => updateField('percentileRank', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="1-99"
            />
            <p className="text-xs text-gray-500">Student's rank compared to peers (1-99)</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="gradeEquivalent">Grade Equivalent</Label>
          <Input
            id="gradeEquivalent"
            type="text"
            value={data.gradeEquivalent ?? ''}
            onChange={(e) => updateField('gradeEquivalent', e.target.value)}
            placeholder="e.g., 3.2"
          />
          <p className="text-xs text-gray-500">Format: grade.month (e.g., 3.2 = 3rd grade, 2nd month)</p>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Domain Scores (0-100)</h4>
        <p className="text-xs text-gray-500">Percentage scores for specific math skills</p>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="numbersAndOperations">Numbers and Operations</Label>
            <Input
              id="numbersAndOperations"
              type="number"
              min="0"
              max="100"
              value={data.numbersAndOperations ?? ''}
              onChange={(e) => updateField('numbersAndOperations', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
            <p className="text-xs text-gray-500">
              Understanding number concepts, arithmetic operations, and number properties
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="algebra">Algebra</Label>
            <Input
              id="algebra"
              type="number"
              min="0"
              max="100"
              value={data.algebra ?? ''}
              onChange={(e) => updateField('algebra', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
            <p className="text-xs text-gray-500">
              Patterns, expressions, equations, and algebraic thinking
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="geometryAndMeasurement">Geometry and Measurement</Label>
            <Input
              id="geometryAndMeasurement"
              type="number"
              min="0"
              max="100"
              value={data.geometryAndMeasurement ?? ''}
              onChange={(e) => updateField('geometryAndMeasurement', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
            <p className="text-xs text-gray-500">
              Shapes, spatial reasoning, units of measure, and measurement concepts
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataAnalysisStatisticsAndProbability">
              Data Analysis, Statistics, and Probability
            </Label>
            <Input
              id="dataAnalysisStatisticsAndProbability"
              type="number"
              min="0"
              max="100"
              value={data.dataAnalysisStatisticsAndProbability ?? ''}
              onChange={(e) => updateField('dataAnalysisStatisticsAndProbability', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
            <p className="text-xs text-gray-500">
              Reading graphs, analyzing data, probability, and statistical concepts
            </p>
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
