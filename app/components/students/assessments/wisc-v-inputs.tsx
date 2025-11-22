'use client';

import React from 'react';
import type { WiscVAssessmentData } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface WiscVInputsProps {
  data: WiscVAssessmentData;
  onChange: (data: WiscVAssessmentData) => void;
}

export default function WiscVInputs({ data, onChange }: WiscVInputsProps) {
  const updateField = (field: keyof WiscVAssessmentData, value: any) => {
    onChange({
      ...data,
      [field]: value === '' ? undefined : value,
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Full Scale IQ</h4>
        <p className="text-xs text-gray-500">
          Standard scores: Mean = 100, Standard Deviation = 15
        </p>

        <div className="space-y-2">
          <Label htmlFor="fullScaleIQ">Full Scale IQ (FSIQ)</Label>
          <Input
            id="fullScaleIQ"
            type="number"
            value={data.fullScaleIQ ?? ''}
            onChange={(e) => updateField('fullScaleIQ', e.target.value ? parseFloat(e.target.value) : undefined)}
            placeholder="40-160"
          />
          <p className="text-xs text-gray-500">Overall cognitive ability measure</p>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Primary Index Scores</h4>
        <p className="text-xs text-gray-500">
          Standard scores: Mean = 100, SD = 15. Range typically 40-160.
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="verbalComprehension">Verbal Comprehension Index (VCI)</Label>
            <Input
              id="verbalComprehension"
              type="number"
              value={data.verbalComprehension ?? ''}
              onChange={(e) => updateField('verbalComprehension', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">
              Verbal reasoning, comprehension, and acquired knowledge
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="visualSpatial">Visual Spatial Index (VSI)</Label>
            <Input
              id="visualSpatial"
              type="number"
              value={data.visualSpatial ?? ''}
              onChange={(e) => updateField('visualSpatial', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">
              Evaluating visual details and visual-spatial relationships
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="fluidReasoning">Fluid Reasoning Index (FRI)</Label>
            <Input
              id="fluidReasoning"
              type="number"
              value={data.fluidReasoning ?? ''}
              onChange={(e) => updateField('fluidReasoning', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">
              Abstract reasoning, problem-solving with novel information
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workingMemory">Working Memory Index (WMI)</Label>
            <Input
              id="workingMemory"
              type="number"
              value={data.workingMemory ?? ''}
              onChange={(e) => updateField('workingMemory', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">
              Attention, concentration, and holding information in mind
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="processingSpeed">Processing Speed Index (PSI)</Label>
            <Input
              id="processingSpeed"
              type="number"
              value={data.processingSpeed ?? ''}
              onChange={(e) => updateField('processingSpeed', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">
              Speed of mental and graphomotor processing
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Additional Composite Scores (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="generalAbilityIndex">General Ability Index (GAI)</Label>
            <Input
              id="generalAbilityIndex"
              type="number"
              value={data.generalAbilityIndex ?? ''}
              onChange={(e) => updateField('generalAbilityIndex', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">VCI + VSI + FRI (without WM and PS)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cognitiveProfileIndex">Cognitive Proficiency Index (CPI)</Label>
            <Input
              id="cognitiveProfileIndex"
              type="number"
              value={data.cognitiveProfileIndex ?? ''}
              onChange={(e) => updateField('cognitiveProfileIndex', e.target.value ? parseFloat(e.target.value) : undefined)}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">WMI + PSI (efficiency of cognitive processing)</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes (Optional)</Label>
        <Textarea
          id="notes"
          value={data.notes ?? ''}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Add any additional notes about this assessment, interpretations, or recommendations..."
          rows={3}
        />
      </div>
    </div>
  );
}
