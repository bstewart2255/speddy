'use client';

import React from 'react';
import type { Wiat4AssessmentData } from '../../../../types/student-assessments';
import { Label } from '../../ui/label';
import { Input } from '../../ui/input';
import { Textarea } from '../../ui/textarea';

interface Wiat4InputsProps {
  data: Wiat4AssessmentData;
  onChange: (data: Wiat4AssessmentData) => void;
}

export default function Wiat4Inputs({ data, onChange }: Wiat4InputsProps) {
  const updateField = (field: keyof Wiat4AssessmentData, value: any) => {
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
        <h4 className="font-medium text-sm text-gray-700">Composite Scores</h4>
        <p className="text-xs text-gray-500">
          Standard scores: Mean = 100, Standard Deviation = 15. Average range = 90-110.
        </p>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="totalAchievement">Total Achievement</Label>
            <Input
              id="totalAchievement"
              type="number"
              value={data.totalAchievement ?? ''}
              onChange={(e) => updateField('totalAchievement', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Overall academic achievement across all domains</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reading">Reading Composite</Label>
            <Input
              id="reading"
              type="number"
              value={data.reading ?? ''}
              onChange={(e) => updateField('reading', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Overall reading ability and comprehension</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mathematics">Mathematics Composite</Label>
            <Input
              id="mathematics"
              type="number"
              value={data.mathematics ?? ''}
              onChange={(e) => updateField('mathematics', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Overall mathematical reasoning and computation</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writtenExpression">Written Expression Composite</Label>
            <Input
              id="writtenExpression"
              type="number"
              value={data.writtenExpression ?? ''}
              onChange={(e) => updateField('writtenExpression', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Overall writing skills and expression</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="oralLanguage">Oral Language Composite</Label>
            <Input
              id="oralLanguage"
              type="number"
              value={data.oralLanguage ?? ''}
              onChange={(e) => updateField('oralLanguage', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Listening and oral expression abilities</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Additional Indices (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dyslexiaIndex">Dyslexia Index</Label>
            <Input
              id="dyslexiaIndex"
              type="number"
              value={data.dyslexiaIndex ?? ''}
              onChange={(e) => updateField('dyslexiaIndex', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Screening measure for dyslexia risk</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phonologicalProcessing">Phonological Processing</Label>
            <Input
              id="phonologicalProcessing"
              type="number"
              value={data.phonologicalProcessing ?? ''}
              onChange={(e) => updateField('phonologicalProcessing', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Phonemic awareness and processing</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="orthographicProcessing">Orthographic Processing</Label>
            <Input
              id="orthographicProcessing"
              type="number"
              value={data.orthographicProcessing ?? ''}
              onChange={(e) => updateField('orthographicProcessing', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Visual word recognition and processing</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="writingFluency">Writing Fluency</Label>
            <Input
              id="writingFluency"
              type="number"
              value={data.writingFluency ?? ''}
              onChange={(e) => updateField('writingFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Speed and automaticity of writing</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Reading Subtests (Optional)</h4>
        <p className="text-xs text-gray-500">Standard scores for individual reading measures</p>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="wordReading">Word Reading</Label>
            <Input
              id="wordReading"
              type="number"
              value={data.wordReading ?? ''}
              onChange={(e) => updateField('wordReading', parseNumber(e.target.value))}
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
            <Label htmlFor="oralReadingFluency">Oral Reading Fluency</Label>
            <Input
              id="oralReadingFluency"
              type="number"
              value={data.oralReadingFluency ?? ''}
              onChange={(e) => updateField('oralReadingFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="pseudowordDecoding">Pseudoword Decoding</Label>
            <Input
              id="pseudowordDecoding"
              type="number"
              value={data.pseudowordDecoding ?? ''}
              onChange={(e) => updateField('pseudowordDecoding', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="orthographicFluency">Orthographic Fluency</Label>
            <Input
              id="orthographicFluency"
              type="number"
              value={data.orthographicFluency ?? ''}
              onChange={(e) => updateField('orthographicFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Mathematics Subtests (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="numericalOperations">Numerical Operations</Label>
            <Input
              id="numericalOperations"
              type="number"
              value={data.numericalOperations ?? ''}
              onChange={(e) => updateField('numericalOperations', parseNumber(e.target.value))}
              placeholder="40-160"
            />
            <p className="text-xs text-gray-500">Written math computation</p>
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
            <p className="text-xs text-gray-500">Mathematical reasoning and problem solving</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Written Expression Subtests (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="spelling">Spelling</Label>
            <Input
              id="spelling"
              type="number"
              value={data.spelling ?? ''}
              onChange={(e) => updateField('spelling', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="alphabetWritingFluency">Alphabet Writing Fluency</Label>
            <Input
              id="alphabetWritingFluency"
              type="number"
              value={data.alphabetWritingFluency ?? ''}
              onChange={(e) => updateField('alphabetWritingFluency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sentenceComposition">Sentence Composition</Label>
            <Input
              id="sentenceComposition"
              type="number"
              value={data.sentenceComposition ?? ''}
              onChange={(e) => updateField('sentenceComposition', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="essayComposition">Essay Composition</Label>
            <Input
              id="essayComposition"
              type="number"
              value={data.essayComposition ?? ''}
              onChange={(e) => updateField('essayComposition', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h4 className="font-medium text-sm text-gray-700">Oral Language Subtests (Optional)</h4>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="listeningComprehension">Listening Comprehension</Label>
            <Input
              id="listeningComprehension"
              type="number"
              value={data.listeningComprehension ?? ''}
              onChange={(e) => updateField('listeningComprehension', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="oralExpression">Oral Expression</Label>
            <Input
              id="oralExpression"
              type="number"
              value={data.oralExpression ?? ''}
              onChange={(e) => updateField('oralExpression', parseNumber(e.target.value))}
              placeholder="40-160"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="phonemicProficiency">Phonemic Proficiency</Label>
            <Input
              id="phonemicProficiency"
              type="number"
              value={data.phonemicProficiency ?? ''}
              onChange={(e) => updateField('phonemicProficiency', parseNumber(e.target.value))}
              placeholder="40-160"
            />
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
