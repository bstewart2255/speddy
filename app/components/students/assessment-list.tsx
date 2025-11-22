'use client';

import React, { useState, useEffect } from 'react';
import {
  getStudentAssessments,
  deleteAssessment,
} from '../../../lib/supabase/queries/student-assessments';
import type {
  StudentAssessment,
  AssessmentType,
  MClassAssessmentData,
  StarReadingAssessmentData,
  StarMathAssessmentData,
  WiscVAssessmentData,
  BriefAssessmentData,
} from '../../../types/student-assessments';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/card';
import { Badge } from '../ui/badge';
import { Trash2, Edit, Plus } from 'lucide-react';
import { format } from 'date-fns';
import AssessmentSelector from './assessment-selector';

interface AssessmentListProps {
  studentId: string;
  readOnly?: boolean;
}

const ASSESSMENT_LABELS: Record<AssessmentType, string> = {
  mclass: 'mClass (DIBELS)',
  star_reading: 'STAR Reading',
  star_math: 'STAR Math',
  wisc_v: 'WISC-V',
  brief: 'BRIEF (Executive Function)',
};

export default function AssessmentList({ studentId, readOnly = false }: AssessmentListProps) {
  const [assessments, setAssessments] = useState<StudentAssessment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<StudentAssessment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadAssessments();
  }, [studentId]);

  const loadAssessments = async () => {
    try {
      setLoading(true);
      const data = await getStudentAssessments(studentId);
      setAssessments(data);
    } catch (error) {
      console.error('Error loading assessments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (assessmentId: string) => {
    if (!confirm('Are you sure you want to delete this assessment?')) {
      return;
    }

    try {
      setDeletingId(assessmentId);
      await deleteAssessment(assessmentId);
      await loadAssessments();
    } catch (error) {
      console.error('Error deleting assessment:', error);
      alert('Failed to delete assessment. Please try again.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (assessment: StudentAssessment) => {
    setEditingAssessment(assessment);
    setShowAddForm(true);
  };

  const handleCloseForm = () => {
    setShowAddForm(false);
    setEditingAssessment(null);
    loadAssessments();
  };

  const getAssessmentBadgeColor = (type: AssessmentType): string => {
    switch (type) {
      case 'mclass':
        return 'bg-blue-100 text-blue-800';
      case 'star_reading':
        return 'bg-purple-100 text-purple-800';
      case 'star_math':
        return 'bg-green-100 text-green-800';
      case 'wisc_v':
        return 'bg-orange-100 text-orange-800';
      case 'brief':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const renderAssessmentSummary = (assessment: StudentAssessment): React.ReactNode => {
    const { assessmentType, data } = assessment;

    switch (assessmentType) {
      case 'mclass': {
        const mclassData = data as MClassAssessmentData;
        return (
          <div className="text-sm text-gray-600 mt-2">
            {mclassData.compositeScore && <p>Composite Score: {mclassData.compositeScore}</p>}
            {mclassData.riskLevel && (
              <p>
                Risk Level:{' '}
                <span
                  className={
                    mclassData.riskLevel === 'low_risk'
                      ? 'text-green-600 font-medium'
                      : mclassData.riskLevel === 'some_risk'
                      ? 'text-yellow-600 font-medium'
                      : 'text-red-600 font-medium'
                  }
                >
                  {mclassData.riskLevel === 'low_risk'
                    ? 'Low Risk'
                    : mclassData.riskLevel === 'some_risk'
                    ? 'Some Risk'
                    : 'High Risk'}
                </span>
              </p>
            )}
            {mclassData.dorfWordsCorrect && <p>DORF WPM: {mclassData.dorfWordsCorrect}</p>}
          </div>
        );
      }

      case 'star_reading': {
        const starReadingData = data as StarReadingAssessmentData;
        return (
          <div className="text-sm text-gray-600 mt-2">
            {starReadingData.scaledScore && <p>Scaled Score: {starReadingData.scaledScore}</p>}
            {starReadingData.percentileRank && <p>Percentile: {starReadingData.percentileRank}</p>}
            {starReadingData.instructionalReadingLevel && (
              <p>Instructional Level: {starReadingData.instructionalReadingLevel}</p>
            )}
          </div>
        );
      }

      case 'star_math': {
        const starMathData = data as StarMathAssessmentData;
        return (
          <div className="text-sm text-gray-600 mt-2">
            {starMathData.scaledScore && <p>Scaled Score: {starMathData.scaledScore}</p>}
            {starMathData.percentileRank && <p>Percentile: {starMathData.percentileRank}</p>}
            {starMathData.gradeEquivalent && <p>Grade Equivalent: {starMathData.gradeEquivalent}</p>}
          </div>
        );
      }

      case 'wisc_v': {
        const wiscData = data as WiscVAssessmentData;
        return (
          <div className="text-sm text-gray-600 mt-2">
            {wiscData.fullScaleIQ && <p>Full Scale IQ: {wiscData.fullScaleIQ}</p>}
            {wiscData.verbalComprehension && <p>Verbal Comprehension: {wiscData.verbalComprehension}</p>}
            {wiscData.workingMemory && <p>Working Memory: {wiscData.workingMemory}</p>}
          </div>
        );
      }

      case 'brief': {
        const briefData = data as BriefAssessmentData;
        return (
          <div className="text-sm text-gray-600 mt-2">
            {briefData.globalExecutiveComposite && (
              <p>Global Executive Composite: {briefData.globalExecutiveComposite}</p>
            )}
            {briefData.behavioralRegulationIndex && (
              <p>Behavioral Regulation: {briefData.behavioralRegulationIndex}</p>
            )}
          </div>
        );
      }

      default:
        return null;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading assessments...</div>;
  }

  if (showAddForm) {
    return (
      <AssessmentSelector
        studentId={studentId}
        existingAssessment={editingAssessment}
        onClose={handleCloseForm}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Student Assessments</h3>
        {!readOnly && (
          <Button onClick={() => setShowAddForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Assessment
          </Button>
        )}
      </div>

      {assessments.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-gray-500">
            No assessments recorded yet.
            {!readOnly && ' Click "Add Assessment" to get started.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assessments.map((assessment) => (
            <Card key={assessment.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={getAssessmentBadgeColor(assessment.assessmentType)}>
                        {ASSESSMENT_LABELS[assessment.assessmentType]}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {format(new Date(assessment.assessmentDate), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <CardTitle className="text-base">
                      {ASSESSMENT_LABELS[assessment.assessmentType]}
                    </CardTitle>
                  </div>
                  {!readOnly && (
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(assessment)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(assessment.id)}
                        disabled={deletingId === assessment.id}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>{renderAssessmentSummary(assessment)}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
