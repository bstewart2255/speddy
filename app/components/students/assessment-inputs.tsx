'use client';

import { Input, Label, FormGroup } from '../ui/form';
import { StudentAssessment } from '../../../lib/supabase/queries/student-assessments';
import { AssessmentSection } from './assessment-section';
import { GradeMonthReadingLevelInput } from './grade-month-reading-level-input';

interface AssessmentInputsProps {
  assessment: StudentAssessment;
  onChange: (assessment: StudentAssessment) => void;
  readOnly?: boolean;
}

export function AssessmentInputs({ assessment, onChange, readOnly = false }: AssessmentInputsProps) {
  const updateField = (field: keyof StudentAssessment, value: any) => {
    onChange({
      ...assessment,
      [field]: value === '' ? null : value
    });
  };

  const parseNumberInput = (value: string) => {
    if (value === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  return (
    <div className="space-y-4">
      {/* Reading Assessments */}
      <AssessmentSection title="Reading Assessments" icon="📖">
        <div className="space-y-3">
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Decoding & Fluency</h5>
            <div className="space-y-3">
              <GradeMonthReadingLevelInput
                value={assessment.grade_month_reading_level}
                onChange={(value) => updateField('grade_month_reading_level', value)}
                disabled={readOnly}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormGroup>
                  <Label htmlFor="dibels_wpm">DIBELS WPM Accuracy (%)</Label>
                  <Input
                    id="dibels_wpm"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={assessment.dibels_wpm_accuracy ?? ''}
                    onChange={(e) => updateField('dibels_wpm_accuracy', parseNumberInput(e.target.value))}
                    placeholder="0-100"
                    disabled={readOnly}
                  />
                </FormGroup>
                <FormGroup>
                  <Label htmlFor="nonsense_word">Nonsense Word Fluency</Label>
                  <Input
                    id="nonsense_word"
                    type="number"
                    min="0"
                    step="1"
                    value={assessment.dibels_nonsense_word_fluency ?? ''}
                    onChange={(e) => updateField('dibels_nonsense_word_fluency', parseNumberInput(e.target.value))}
                    placeholder="Score"
                    disabled={readOnly}
                  />
                </FormGroup>
              </div>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Comprehension</h5>
            <div className="grid grid-cols-3 gap-3">
              <FormGroup>
                <Label htmlFor="reading_comp">Accuracy (%)</Label>
                <Input
                  id="reading_comp"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.reading_comprehension_accuracy ?? ''}
                  onChange={(e) => updateField('reading_comprehension_accuracy', parseNumberInput(e.target.value))}
                  placeholder="0-100"
                  disabled={readOnly}
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="lexile">Lexile Level</Label>
                <Input
                  id="lexile"
                  type="text"
                  value={assessment.lexile_level ?? ''}
                  onChange={(e) => updateField('lexile_level', e.target.value)}
                  placeholder="e.g., 450L"
                  disabled={readOnly}
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="fp_dra">F&P/DRA Level</Label>
                <Input
                  id="fp_dra"
                  type="text"
                  value={assessment.fp_dra_level ?? ''}
                  onChange={(e) => updateField('fp_dra_level', e.target.value)}
                  placeholder="Level"
                  disabled={readOnly}
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Phonemic Awareness</h5>
            <FormGroup>
              <Label htmlFor="psf">PSF Score</Label>
              <Input
                id="psf"
                type="number"
                min="0"
                step="1"
                value={assessment.phoneme_segmentation_fluency ?? ''}
                onChange={(e) => updateField('phoneme_segmentation_fluency', parseNumberInput(e.target.value))}
                placeholder="Score"
                disabled={readOnly}
              />
            </FormGroup>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Sight Words</h5>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup>
                <Label htmlFor="sight_words">Words Known</Label>
                <Input
                  id="sight_words"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.sight_words_known ?? ''}
                  onChange={(e) => updateField('sight_words_known', parseNumberInput(e.target.value))}
                  placeholder="Number"
                  disabled={readOnly}
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="sight_words_level">List Level</Label>
                <select
                  id="sight_words_level"
                  value={assessment.sight_words_list_level ?? ''}
                  onChange={(e) => updateField('sight_words_list_level', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  disabled={readOnly}
                >
                  <option value="">Select level</option>
                  <option value="Dolch Pre-K">Dolch Pre-K</option>
                  <option value="Dolch K">Dolch K</option>
                  <option value="Dolch 1st">Dolch 1st</option>
                  <option value="Dolch 2nd">Dolch 2nd</option>
                  <option value="Dolch 3rd">Dolch 3rd</option>
                  <option value="Fry 1-100">Fry 1-100</option>
                  <option value="Fry 101-200">Fry 101-200</option>
                  <option value="Fry 201-300">Fry 201-300</option>
                  <option value="Fry 301-400">Fry 301-400</option>
                  <option value="Fry 401-500">Fry 401-500</option>
                </select>
              </FormGroup>
            </div>
          </div>
        </div>
      </AssessmentSection>

      {/* Math Assessments */}
      <AssessmentSection title="Math Assessments" icon="🔢">
        <div className="space-y-3">
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Computation Accuracy (%)</h5>
            <div className="grid grid-cols-4 gap-3">
              <FormGroup>
                <Label htmlFor="math_add">Addition</Label>
                <Input
                  id="math_add"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.math_computation_addition_accuracy ?? ''}
                  onChange={(e) => updateField('math_computation_addition_accuracy', parseNumberInput(e.target.value))}
                  placeholder="%"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="math_sub">Subtraction</Label>
                <Input
                  id="math_sub"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.math_computation_subtraction_accuracy ?? ''}
                  onChange={(e) => updateField('math_computation_subtraction_accuracy', parseNumberInput(e.target.value))}
                  placeholder="%"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="math_mult">Multiplication</Label>
                <Input
                  id="math_mult"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.math_computation_multiplication_accuracy ?? ''}
                  onChange={(e) => updateField('math_computation_multiplication_accuracy', parseNumberInput(e.target.value))}
                  placeholder="%"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="math_div">Division</Label>
                <Input
                  id="math_div"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.math_computation_division_accuracy ?? ''}
                  onChange={(e) => updateField('math_computation_division_accuracy', parseNumberInput(e.target.value))}
                  placeholder="%"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Fact Fluency (facts/min)</h5>
            <div className="grid grid-cols-4 gap-3">
              <FormGroup>
                <Label htmlFor="fluency_add">Addition</Label>
                <Input
                  id="fluency_add"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.math_fact_fluency_addition ?? ''}
                  onChange={(e) => updateField('math_fact_fluency_addition', parseNumberInput(e.target.value))}
                  placeholder="Facts/min"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="fluency_sub">Subtraction</Label>
                <Input
                  id="fluency_sub"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.math_fact_fluency_subtraction ?? ''}
                  onChange={(e) => updateField('math_fact_fluency_subtraction', parseNumberInput(e.target.value))}
                  placeholder="Facts/min"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="fluency_mult">Multiplication</Label>
                <Input
                  id="fluency_mult"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.math_fact_fluency_multiplication ?? ''}
                  onChange={(e) => updateField('math_fact_fluency_multiplication', parseNumberInput(e.target.value))}
                  placeholder="Facts/min"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="fluency_div">Division</Label>
                <Input
                  id="fluency_div"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.math_fact_fluency_division ?? ''}
                  onChange={(e) => updateField('math_fact_fluency_division', parseNumberInput(e.target.value))}
                  placeholder="Facts/min"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Problem Solving</h5>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup>
                <Label htmlFor="word_problems">Word Problems Accuracy (%)</Label>
                <Input
                  id="word_problems"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.math_problem_solving_accuracy ?? ''}
                  onChange={(e) => updateField('math_problem_solving_accuracy', parseNumberInput(e.target.value))}
                  placeholder="0-100"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="number_sense">Number Sense Score</Label>
                <Input
                  id="number_sense"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.math_number_sense_score ?? ''}
                  onChange={(e) => updateField('math_number_sense_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
            </div>
          </div>
        </div>
      </AssessmentSection>

      {/* Writing Assessments */}
      <AssessmentSection title="Writing Assessments" icon="✍️">
        <div className="space-y-3">
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Spelling</h5>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup>
                <Label htmlFor="spelling_stage">Developmental Stage</Label>
                <select
                  id="spelling_stage"
                  value={assessment.spelling_developmental_stage ?? ''}
                  onChange={(e) => updateField('spelling_developmental_stage', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select stage</option>
                  <option value="Emergent">Emergent</option>
                  <option value="Letter Name">Letter Name</option>
                  <option value="Within Word Pattern">Within Word Pattern</option>
                  <option value="Syllables and Affixes">Syllables and Affixes</option>
                  <option value="Derivational Relations">Derivational Relations</option>
                </select>
              </FormGroup>
              <FormGroup>
                <Label htmlFor="spelling_acc">Accuracy (%)</Label>
                <Input
                  id="spelling_acc"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={assessment.spelling_accuracy ?? ''}
                  onChange={(e) => updateField('spelling_accuracy', parseNumberInput(e.target.value))}
                  placeholder="0-100"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Expression</h5>
            <div className="grid grid-cols-2 gap-3">
              <FormGroup>
                <Label htmlFor="wj_score">WJ-IV Score</Label>
                <Input
                  id="wj_score"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.written_expression_score ?? ''}
                  onChange={(e) => updateField('written_expression_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="words_sentence">Avg Words per Sentence</Label>
                <Input
                  id="words_sentence"
                  type="number"
                  min="0"
                  step="0.1"
                  value={assessment.words_per_sentence_average ?? ''}
                  onChange={(e) => updateField('words_per_sentence_average', parseNumberInput(e.target.value))}
                  placeholder="Average"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Handwriting</h5>
            <FormGroup>
              <Label htmlFor="handwriting">Letters per Minute</Label>
              <Input
                id="handwriting"
                type="number"
                min="0"
                step="1"
                value={assessment.handwriting_letters_per_minute ?? ''}
                onChange={(e) => updateField('handwriting_letters_per_minute', parseNumberInput(e.target.value))}
                placeholder="Letters/min"
              />
            </FormGroup>
          </div>
        </div>
      </AssessmentSection>

      {/* Cognitive Profile */}
      <AssessmentSection title="Cognitive Profile" icon="🧠">
        <div className="space-y-3">
          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">WISC-V Standard Scores (mean=100)</h5>
            <div className="grid grid-cols-3 gap-3">
              <FormGroup>
                <Label htmlFor="wisc_psi">Processing Speed</Label>
                <Input
                  id="wisc_psi"
                  type="number"
                  min="0"
                  max="200"
                  step="1"
                  value={assessment.wisc_processing_speed_index ?? ''}
                  onChange={(e) => updateField('wisc_processing_speed_index', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="wisc_wmi">Working Memory</Label>
                <Input
                  id="wisc_wmi"
                  type="number"
                  min="0"
                  max="200"
                  step="1"
                  value={assessment.wisc_working_memory_index ?? ''}
                  onChange={(e) => updateField('wisc_working_memory_index', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="wisc_fri">Fluid Reasoning</Label>
                <Input
                  id="wisc_fri"
                  type="number"
                  min="0"
                  max="200"
                  step="1"
                  value={assessment.wisc_fluid_reasoning_index ?? ''}
                  onChange={(e) => updateField('wisc_fluid_reasoning_index', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Academic Achievement</h5>
            <div className="grid grid-cols-3 gap-3">
              <FormGroup>
                <Label htmlFor="academic_fluency">Fluency Score</Label>
                <Input
                  id="academic_fluency"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.academic_fluency_score ?? ''}
                  onChange={(e) => updateField('academic_fluency_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="processing_speed">Processing Speed</Label>
                <Input
                  id="processing_speed"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.processing_speed_score ?? ''}
                  onChange={(e) => updateField('processing_speed_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="cognitive_eff">Cognitive Efficiency</Label>
                <Input
                  id="cognitive_eff"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.cognitive_efficiency_score ?? ''}
                  onChange={(e) => updateField('cognitive_efficiency_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Executive Function (T-scores, mean=50)</h5>
            <div className="grid grid-cols-3 gap-3">
              <FormGroup>
                <Label htmlFor="brief_wm">Working Memory</Label>
                <Input
                  id="brief_wm"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={assessment.brief_working_memory_tscore ?? ''}
                  onChange={(e) => updateField('brief_working_memory_tscore', parseNumberInput(e.target.value))}
                  placeholder="T-score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="brief_inhib">Inhibition</Label>
                <Input
                  id="brief_inhib"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={assessment.brief_inhibition_tscore ?? ''}
                  onChange={(e) => updateField('brief_inhibition_tscore', parseNumberInput(e.target.value))}
                  placeholder="T-score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="brief_flex">Flexibility</Label>
                <Input
                  id="brief_flex"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  value={assessment.brief_shift_flexibility_tscore ?? ''}
                  onChange={(e) => updateField('brief_shift_flexibility_tscore', parseNumberInput(e.target.value))}
                  placeholder="T-score"
                />
              </FormGroup>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-gray-700 mb-2">Memory (Scaled scores)</h5>
            <div className="grid grid-cols-3 gap-3">
              <FormGroup>
                <Label htmlFor="immediate_recall">Immediate Recall</Label>
                <Input
                  id="immediate_recall"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.immediate_recall_score ?? ''}
                  onChange={(e) => updateField('immediate_recall_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="delayed_recall">Delayed Recall</Label>
                <Input
                  id="delayed_recall"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.delayed_recall_score ?? ''}
                  onChange={(e) => updateField('delayed_recall_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
              <FormGroup>
                <Label htmlFor="recognition">Recognition</Label>
                <Input
                  id="recognition"
                  type="number"
                  min="0"
                  step="1"
                  value={assessment.recognition_score ?? ''}
                  onChange={(e) => updateField('recognition_score', parseNumberInput(e.target.value))}
                  placeholder="Score"
                />
              </FormGroup>
            </div>
          </div>
        </div>
      </AssessmentSection>

      {/* Assessment Date */}
      <FormGroup>
        <Label htmlFor="assessment_date">Assessment Date</Label>
        <Input
          id="assessment_date"
          type="date"
          value={assessment.assessment_date ?? ''}
          onChange={(e) => updateField('assessment_date', e.target.value)}
          disabled={readOnly}
        />
      </FormGroup>
    </div>
  );
}