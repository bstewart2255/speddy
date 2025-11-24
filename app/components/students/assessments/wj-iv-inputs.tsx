'use client';

import React from 'react';
import type { WjIvAssessmentData } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface WjIvInputsProps {
  data: WjIvAssessmentData;
  onChange: (data: WjIvAssessmentData) => void;
}

export default function WjIvInputs({ data, onChange }: WjIvInputsProps) {
  const updateField = (field: keyof WjIvAssessmentData, value: any) => {
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
        <h4 className="font-medium text-sm text-gray-700">Cross-Domain Cluster Scores</h4>
        <p className="text-xs text-gray-500">
          Standard scores: Mean = 100, Standard Deviation = 15. Average range = 90-110.
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="briefAchievement">Brief Achievement</Label>
            <Input
              id="briefAchievement"
              type="number"
              value={data.briefAchievement ?? ''}
              onChange={(e) => updateField('briefAchievement', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">General academic proficiency across reading, writing, and math</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadAchievement">Broad Achievement</Label>
            <Input
              id="broadAchievement"
              type="number"
              value={data.broadAchievement ?? ''}
              onChange={(e) => updateField('broadAchievement', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Comprehensive measure of academic achievement</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academicSkills">Academic Skills</Label>
            <Input
              id="academicSkills"
              type="number"
              value={data.academicSkills ?? ''}
              onChange={(e) => updateField('academicSkills', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Basic academic skills across domains</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academicFluency">Academic Fluency</Label>
            <Input
              id="academicFluency"
              type="number"
              value={data.academicFluency ?? ''}
              onChange={(e) => updateField('academicFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Speed and automaticity of academic performance</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="academicApplications">Academic Applications</Label>
            <Input
              id="academicApplications"
              type="number"
              value={data.academicApplications ?? ''}
              onChange={(e) => updateField('academicApplications', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Application of academic skills to complex tasks</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Reading Cluster Scores (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="reading">Reading</Label>
            <Input
              id="reading"
              type="number"
              value={data.reading ?? ''}
              onChange={(e) => updateField('reading', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadReading">Broad Reading</Label>
            <Input
              id="broadReading"
              type="number"
              value={data.broadReading ?? ''}
              onChange={(e) => updateField('broadReading', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="basicReadingSkills">Basic Reading Skills</Label>
            <Input
              id="basicReadingSkills"
              type="number"
              value={data.basicReadingSkills ?? ''}
              onChange={(e) => updateField('basicReadingSkills', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="readingComprehension">Reading Comprehension</Label>
            <Input
              id="readingComprehension"
              type="number"
              value={data.readingComprehension ?? ''}
              onChange={(e) => updateField('readingComprehension', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="readingFluency">Reading Fluency</Label>
            <Input
              id="readingFluency"
              type="number"
              value={data.readingFluency ?? ''}
              onChange={(e) => updateField('readingFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="readingRate">Reading Rate</Label>
            <Input
              id="readingRate"
              type="number"
              value={data.readingRate ?? ''}
              onChange={(e) => updateField('readingRate', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Mathematics Cluster Scores (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="mathematics">Mathematics</Label>
            <Input
              id="mathematics"
              type="number"
              value={data.mathematics ?? ''}
              onChange={(e) => updateField('mathematics', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadMathematics">Broad Mathematics</Label>
            <Input
              id="broadMathematics"
              type="number"
              value={data.broadMathematics ?? ''}
              onChange={(e) => updateField('broadMathematics', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mathCalculationSkills">Math Calculation Skills</Label>
            <Input
              id="mathCalculationSkills"
              type="number"
              value={data.mathCalculationSkills ?? ''}
              onChange={(e) => updateField('mathCalculationSkills', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="mathProblemSolving">Math Problem Solving</Label>
            <Input
              id="mathProblemSolving"
              type="number"
              value={data.mathProblemSolving ?? ''}
              onChange={(e) => updateField('mathProblemSolving', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Written Language Cluster Scores (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="writtenLanguage">Written Language</Label>
            <Input
              id="writtenLanguage"
              type="number"
              value={data.writtenLanguage ?? ''}
              onChange={(e) => updateField('writtenLanguage', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="broadWrittenLanguage">Broad Written Language</Label>
            <Input
              id="broadWrittenLanguage"
              type="number"
              value={data.broadWrittenLanguage ?? ''}
              onChange={(e) => updateField('broadWrittenLanguage', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="basicWritingSkills">Basic Writing Skills</Label>
            <Input
              id="basicWritingSkills"
              type="number"
              value={data.basicWritingSkills ?? ''}
              onChange={(e) => updateField('basicWritingSkills', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="writtenExpression">Written Expression</Label>
            <Input
              id="writtenExpression"
              type="number"
              value={data.writtenExpression ?? ''}
              onChange={(e) => updateField('writtenExpression', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Standard Battery Subtests (Optional)</h4>
        <p className="text-xs text-gray-500">Individual test scores from the 11-test Standard Battery</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="letterWordIdentification">Letter-Word Identification</Label>
            <Input
              id="letterWordIdentification"
              type="number"
              value={data.letterWordIdentification ?? ''}
              onChange={(e) => updateField('letterWordIdentification', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 1</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appliedProblems">Applied Problems</Label>
            <Input
              id="appliedProblems"
              type="number"
              value={data.appliedProblems ?? ''}
              onChange={(e) => updateField('appliedProblems', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 2</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spelling">Spelling</Label>
            <Input
              id="spelling"
              type="number"
              value={data.spelling ?? ''}
              onChange={(e) => updateField('spelling', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 3</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="passageComprehension">Passage Comprehension</Label>
            <Input
              id="passageComprehension"
              type="number"
              value={data.passageComprehension ?? ''}
              onChange={(e) => updateField('passageComprehension', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 4</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="calculation">Calculation</Label>
            <Input
              id="calculation"
              type="number"
              value={data.calculation ?? ''}
              onChange={(e) => updateField('calculation', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 5</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writingSamples">Writing Samples</Label>
            <Input
              id="writingSamples"
              type="number"
              value={data.writingSamples ?? ''}
              onChange={(e) => updateField('writingSamples', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 6</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="wordAttack">Word Attack</Label>
            <Input
              id="wordAttack"
              type="number"
              value={data.wordAttack ?? ''}
              onChange={(e) => updateField('wordAttack', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 7</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oralReading">Oral Reading</Label>
            <Input
              id="oralReading"
              type="number"
              value={data.oralReading ?? ''}
              onChange={(e) => updateField('oralReading', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 8</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sentenceReadingFluency">Sentence Reading Fluency</Label>
            <Input
              id="sentenceReadingFluency"
              type="number"
              value={data.sentenceReadingFluency ?? ''}
              onChange={(e) => updateField('sentenceReadingFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 9</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mathFactsFluency">Math Facts Fluency</Label>
            <Input
              id="mathFactsFluency"
              type="number"
              value={data.mathFactsFluency ?? ''}
              onChange={(e) => updateField('mathFactsFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 10</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sentenceWritingFluency">Sentence Writing Fluency</Label>
            <Input
              id="sentenceWritingFluency"
              type="number"
              value={data.sentenceWritingFluency ?? ''}
              onChange={(e) => updateField('sentenceWritingFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Test 11</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Additional Score Information (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="percentileRank">Percentile Rank</Label>
            <Input
              id="percentileRank"
              type="number"
              value={data.percentileRank ?? ''}
              onChange={(e) => updateField('percentileRank', parseNumber(e.target.value))}
              placeholder="1-99"
            />
            <p className="text-xs text-gray-500">Overall percentile rank (if reported)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relativeProficiencyIndex">Relative Proficiency Index (RPI)</Label>
            <Input
              id="relativeProficiencyIndex"
              type="text"
              value={data.relativeProficiencyIndex ?? ''}
              onChange={(e) => updateField('relativeProficiencyIndex', e.target.value)}
              placeholder="e.g., 95/90"
            />
            <p className="text-xs text-gray-500">RPI score format (e.g., 95/90)</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ageEquivalent">Age Equivalent</Label>
            <Input
              id="ageEquivalent"
              type="text"
              value={data.ageEquivalent ?? ''}
              onChange={(e) => updateField('ageEquivalent', e.target.value)}
              placeholder="e.g., 8-6 (8 years, 6 months)"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="gradeEquivalent">Grade Equivalent</Label>
            <Input
              id="gradeEquivalent"
              type="text"
              value={data.gradeEquivalent ?? ''}
              onChange={(e) => updateField('gradeEquivalent', e.target.value)}
              placeholder="e.g., 3.5"
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
          placeholder="Add any additional notes about this assessment, interpretations, or recommendations..."
          rows={3}
        />
      </div>
    </div>
  );
}
