'use client';

import React from 'react';
import type { MClassAssessmentData, RiskLevel } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Textarea } from '../../ui/textarea';

interface MClassInputsProps {
  data: MClassAssessmentData;
  onChange: (data: MClassAssessmentData) => void;
}

export default function MClassInputs({ data, onChange }: MClassInputsProps) {
  const updateField = (field: keyof MClassAssessmentData, value: any) => {
    onChange({
      ...data,
      [field]: value === '' ? undefined : value,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Overall Scores</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="compositeScore">Composite Score</Label>
            <Input
              id="compositeScore"
              type="number"
              value={data.compositeScore ?? ''}
              onChange={(e) => updateField('compositeScore', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Enter composite score"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="riskLevel">Risk Level</Label>
            <Select
              value={data.riskLevel ?? ''}
              onValueChange={(value) => updateField('riskLevel', value as RiskLevel)}
            >
              <SelectTrigger id="riskLevel">
                <SelectValue placeholder="Select risk level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low_risk">Low Risk</SelectItem>
                <SelectItem value="some_risk">Some Risk</SelectItem>
                <SelectItem value="high_risk">High Risk</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Early Literacy Measures (K)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="letterNamingFluency">Letter Naming Fluency</Label>
            <Input
              id="letterNamingFluency"
              type="number"
              value={data.letterNamingFluency ?? ''}
              onChange={(e) => updateField('letterNamingFluency', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Letters per minute"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phonemeSegmentationFluency">Phoneme Segmentation Fluency</Label>
            <Input
              id="phonemeSegmentationFluency"
              type="number"
              value={data.phonemeSegmentationFluency ?? ''}
              onChange={(e) => updateField('phonemeSegmentationFluency', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Correct phonemes per minute"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Nonsense Word Fluency</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nonsenseWordFluency">NWF Score</Label>
            <Input
              id="nonsenseWordFluency"
              type="number"
              value={data.nonsenseWordFluency ?? ''}
              onChange={(e) => updateField('nonsenseWordFluency', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Correct letter sounds per minute"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nonsenseWordFluencyAccuracy">NWF Accuracy (%)</Label>
            <Input
              id="nonsenseWordFluencyAccuracy"
              type="number"
              min="0"
              max="100"
              value={data.nonsenseWordFluencyAccuracy ?? ''}
              onChange={(e) => updateField('nonsenseWordFluencyAccuracy', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">
          DORF - Oral Reading Fluency (1st+)
        </h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dorfWordsCorrect">Words Correct Per Minute</Label>
            <Input
              id="dorfWordsCorrect"
              type="number"
              value={data.dorfWordsCorrect ?? ''}
              onChange={(e) => updateField('dorfWordsCorrect', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="Words per minute"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dorfAccuracy">DORF Accuracy (%)</Label>
            <Input
              id="dorfAccuracy"
              type="number"
              min="0"
              max="100"
              value={data.dorfAccuracy ?? ''}
              onChange={(e) => updateField('dorfAccuracy', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="0-100"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Maze (Comprehension)</h4>

        <div className="space-y-2">
          <Label htmlFor="mazeAdjustedScore">Maze Adjusted Score</Label>
          <Input
            id="mazeAdjustedScore"
            type="number"
            value={data.mazeAdjustedScore ?? ''}
            onChange={(e) => updateField('mazeAdjustedScore', e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="Enter maze adjusted score"
          />
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
