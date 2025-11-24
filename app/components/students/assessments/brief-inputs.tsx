'use client';

import React from 'react';
import type { BriefAssessmentData } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface BriefInputsProps {
  data: BriefAssessmentData;
  onChange: (data: BriefAssessmentData) => void;
}

export default function BriefInputs({ data, onChange }: BriefInputsProps) {
  const updateField = (field: keyof BriefAssessmentData, value: any) => {
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
        <div className="bg-blue-50 p-4 rounded-md">
          <h4 className="font-medium text-sm text-gray-700 mb-2">
            Understanding T-Scores
          </h4>
          <p className="text-xs text-gray-600">
            T-scores have a mean of 50 and standard deviation of 10. Higher scores indicate
            more problems with executive function. Typical range: 20-80.
          </p>
          <ul className="text-xs text-gray-600 mt-2 ml-4 list-disc">
            <li>65 or higher: Clinically elevated (significant concern)</li>
            <li>60-64: Mildly elevated (borderline concern)</li>
            <li>40-59: Within normal limits</li>
          </ul>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Clinical Scales (T-Scores)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="inhibit">Inhibit</Label>
            <Input
              id="inhibit"
              type="number"
              value={data.inhibit ?? ''}
              onChange={(e) => updateField('inhibit', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Ability to resist impulses and stop behavior</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="selfMonitor">Self-Monitor</Label>
            <Input
              id="selfMonitor"
              type="number"
              value={data.selfMonitor ?? ''}
              onChange={(e) => updateField('selfMonitor', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Awareness of effect on others</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shift">Shift</Label>
            <Input
              id="shift"
              type="number"
              value={data.shift ?? ''}
              onChange={(e) => updateField('shift', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Ability to switch focus and adapt to changes</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emotionalControl">Emotional Control</Label>
            <Input
              id="emotionalControl"
              type="number"
              value={data.emotionalControl ?? ''}
              onChange={(e) => updateField('emotionalControl', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Ability to modulate emotional responses</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initiateTask">Initiate</Label>
            <Input
              id="initiateTask"
              type="number"
              value={data.initiateTask ?? ''}
              onChange={(e) => updateField('initiateTask', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Beginning tasks and generating ideas</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="workingMemory">Working Memory</Label>
            <Input
              id="workingMemory"
              type="number"
              value={data.workingMemory ?? ''}
              onChange={(e) => updateField('workingMemory', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Holding information in mind while working</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="planOrganize">Plan/Organize</Label>
            <Input
              id="planOrganize"
              type="number"
              value={data.planOrganize ?? ''}
              onChange={(e) => updateField('planOrganize', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Managing tasks and setting goals</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="taskMonitor">Task Monitor</Label>
            <Input
              id="taskMonitor"
              type="number"
              value={data.taskMonitor ?? ''}
              onChange={(e) => updateField('taskMonitor', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Checking and evaluating work</p>
          </div>

          <div className="space-y-2 col-span-2">
            <Label htmlFor="organizationOfMaterials">Organization of Materials</Label>
            <Input
              id="organizationOfMaterials"
              type="number"
              value={data.organizationOfMaterials ?? ''}
              onChange={(e) => updateField('organizationOfMaterials', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Keeping workspace and materials organized</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Index/Composite Scores (T-Scores)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="behavioralRegulationIndex">
              Behavioral Regulation Index (BRI)
            </Label>
            <Input
              id="behavioralRegulationIndex"
              type="number"
              value={data.behavioralRegulationIndex ?? ''}
              onChange={(e) => updateField('behavioralRegulationIndex', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Inhibit + Self-Monitor</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="emotionRegulationIndex">
              Emotion Regulation Index (ERI)
            </Label>
            <Input
              id="emotionRegulationIndex"
              type="number"
              value={data.emotionRegulationIndex ?? ''}
              onChange={(e) => updateField('emotionRegulationIndex', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">Shift + Emotional Control</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cognitiveRegulationIndex">
              Cognitive Regulation Index (CRI)
            </Label>
            <Input
              id="cognitiveRegulationIndex"
              type="number"
              value={data.cognitiveRegulationIndex ?? ''}
              onChange={(e) => updateField('cognitiveRegulationIndex', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">
              Initiate + Working Memory + Plan/Organize + Task Monitor + Organization
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="globalExecutiveComposite">
              Global Executive Composite (GEC)
            </Label>
            <Input
              id="globalExecutiveComposite"
              type="number"
              value={data.globalExecutiveComposite ?? ''}
              onChange={(e) => updateField('globalExecutiveComposite', parseNumber(e.target.value))}
              placeholder="20-80"
            />
            <p className="text-xs text-gray-500">
              Overall summary of executive function difficulties
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
          placeholder="Add any additional notes about this assessment, interpretations, or recommendations..."
          rows={3}
        />
      </div>
    </div>
  );
}
