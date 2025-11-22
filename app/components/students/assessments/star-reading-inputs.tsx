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
            <p className="text-xs text-gray-500">STAR Reading scaled scores range from 0-1400</p>
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

        <div className="grid grid-cols-2 gap-4">
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

          <div className="space-y-2">
            <Label htmlFor="instructionalReadingLevel">Instructional Reading Level</Label>
            <Input
              id="instructionalReadingLevel"
              type="text"
              value={data.instructionalReadingLevel ?? ''}
              onChange={(e) => updateField('instructionalReadingLevel', e.target.value)}
              placeholder="e.g., 3.5"
            />
            <p className="text-xs text-gray-500">Recommended reading level for instruction</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Domain Scores (0-100)</h4>
        <p className="text-xs text-gray-500">Percentage scores for specific reading skills</p>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wordKnowledgeAndSkills">Word Knowledge and Skills</Label>
            <Input
              id="wordKnowledgeAndSkills"
              type="number"
              min="0"
              max="100"
              value={data.wordKnowledgeAndSkills ?? ''}
              onChange={(e) => updateField('wordKnowledgeAndSkills', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comprehensionStrategiesAndConstructiveMeaning">
              Comprehension Strategies and Constructing Meaning
            </Label>
            <Input
              id="comprehensionStrategiesAndConstructiveMeaning"
              type="number"
              min="0"
              max="100"
              value={data.comprehensionStrategiesAndConstructiveMeaning ?? ''}
              onChange={(e) => updateField('comprehensionStrategiesAndConstructiveMeaning', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="analyzingLiteraryText">Analyzing Literary Text</Label>
            <Input
              id="analyzingLiteraryText"
              type="number"
              min="0"
              max="100"
              value={data.analyzingLiteraryText ?? ''}
              onChange={(e) => updateField('analyzingLiteraryText', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="understandingAuthorscraft">Understanding Author's Craft</Label>
            <Input
              id="understandingAuthorscraft"
              type="number"
              min="0"
              max="100"
              value={data.understandingAuthorscraft ?? ''}
              onChange={(e) => updateField('understandingAuthorscraft', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="analyzingArgumentAndEvaluatingText">
              Analyzing Argument and Evaluating Text
            </Label>
            <Input
              id="analyzingArgumentAndEvaluatingText"
              type="number"
              min="0"
              max="100"
              value={data.analyzingArgumentAndEvaluatingText ?? ''}
              onChange={(e) => updateField('analyzingArgumentAndEvaluatingText', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
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
