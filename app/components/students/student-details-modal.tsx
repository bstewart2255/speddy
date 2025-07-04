'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input, Label, FormGroup } from '../ui/form';
import { getStudentDetails, upsertStudentDetails, StudentDetails } from '../../../lib/supabase/queries/student-details';
import { SkillsChecklist } from './skills-checklist';

interface StudentDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  student: {
    id: string;
    initials: string;
    grade_level: string;
    teacher_name: string;
    sessions_per_week: number;
    minutes_per_session: number;
  };
  onSave?: (studentId: string, details: StudentDetails) => void;
  onUpdateStudent?: (studentId: string, updates: {
    grade_level: string;
    teacher_name: string;
    sessions_per_week: number;
    minutes_per_session: number;
  }) => void;
}

export function StudentDetailsModal({ 
  isOpen, 
  onClose, 
  student,
  onSave,
  onUpdateStudent
}: StudentDetailsModalProps) {
  const [details, setDetails] = useState<StudentDetails>({
    first_name: '',
    last_name: '',
    date_of_birth: '',
    district_id: '',
    upcoming_iep_date: '',
    upcoming_triennial_date: '',
    iep_goals: [],
    working_skills: [],
  });
  const [loading, setLoading] = useState(false);

  const [studentInfo, setStudentInfo] = useState({
    grade_level: student.grade_level,
    teacher_name: student.teacher_name,
    sessions_per_week: student.sessions_per_week,
    minutes_per_session: student.minutes_per_session,
  });

  // Reset form when modal opens with a different student
  useEffect(() => {
    if (isOpen && student.id) {
      // Reset student info to current values
      setStudentInfo({
        grade_level: student.grade_level,
        teacher_name: student.teacher_name,
        sessions_per_week: student.sessions_per_week,
        minutes_per_session: student.minutes_per_session,
      });

      // Load existing student details
      const loadDetails = async () => {
        try {
          const existingDetails = await getStudentDetails(student.id);
          if (existingDetails) {
            setDetails(existingDetails);
          } else {
            // Reset to empty if no details exist
            setDetails({
              first_name: '',
              last_name: '',
              date_of_birth: '',
              district_id: '',
              upcoming_iep_date: '',
              upcoming_triennial_date: '',
              iep_goals: [],
              working_skills: [],
            });
          }
        } catch (error) {
          console.error('Error loading student details:', error);
        }
      };

      loadDetails();
    }
  }, [isOpen, student.id]);

  const handleSave = async () => {
    setLoading(true);
    try {
      console.log('Saving student details:', details);

      // Save student details
      await upsertStudentDetails(student.id, details);
      console.log('Student details saved successfully');

      // Update student info if changed
      if (onUpdateStudent) {
        console.log('Updating student info:', studentInfo);
        await onUpdateStudent(student.id, studentInfo);
        console.log('Student info updated successfully');
      }

      if (onSave) {
        onSave(student.id, details);
      }
      onClose();
    } catch (error) {
      console.error('Error saving:', error);
      console.error('Full error details:', {
        message: error.message,
        stack: error.stack,
        details: error.details,
        hint: error.hint
      });
      alert('Failed to save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">
              Student Details: {student.initials}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 text-2xl font-light leading-none pb-1"
            >
              ×
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Current Information (Editable) */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Current Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="grade_level">Grade Level</Label>
                  <select
                    id="grade_level"
                    value={studentInfo.grade_level}
                    onChange={(e) => setStudentInfo({...studentInfo, grade_level: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="K">Kindergarten</option>
                    <option value="1">1st Grade</option>
                    <option value="2">2nd Grade</option>
                    <option value="3">3rd Grade</option>
                    <option value="4">4th Grade</option>
                    <option value="5">5th Grade</option>
                    <option value="6">6th Grade</option>
                    <option value="7">7th Grade</option>
                    <option value="8">8th Grade</option>
                  </select>
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="teacher_name">Teacher Name</Label>
                  <Input
                    id="teacher_name"
                    type="text"
                    value={studentInfo.teacher_name}
                    onChange={(e) => setStudentInfo({...studentInfo, teacher_name: e.target.value})}
                    placeholder="Enter teacher name"
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="sessions_per_week">Sessions per Week</Label>
                  <select
                    id="sessions_per_week"
                    value={studentInfo.sessions_per_week}
                    onChange={(e) => setStudentInfo({...studentInfo, sessions_per_week: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="minutes_per_session">Minutes per Session</Label>
                  <select
                    id="minutes_per_session"
                    value={studentInfo.minutes_per_session}
                    onChange={(e) => setStudentInfo({...studentInfo, minutes_per_session: parseInt(e.target.value)})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="15">15</option>
                    <option value="20">20</option>
                    <option value="30">30</option>
                    <option value="45">45</option>
                    <option value="60">60</option>
                  </select>
                </FormGroup>
              </div>
            </div>

            {/* Additional Details Form */}
            <div className="space-y-4">
              <h3 className="font-medium text-gray-900">Additional Information</h3>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="first_name">First Name</Label>
                  <Input
                    id="first_name"
                    type="text"
                    value={details.first_name}
                    onChange={(e) => setDetails({...details, first_name: e.target.value})}
                    placeholder="Enter first name"
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="last_name">Last Name</Label>
                  <Input
                    id="last_name"
                    type="text"
                    value={details.last_name}
                    onChange={(e) => setDetails({...details, last_name: e.target.value})}
                    placeholder="Enter last name"
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input
                    id="dob"
                    type="date"
                    value={details.date_of_birth}
                    onChange={(e) => setDetails({...details, date_of_birth: e.target.value})}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="district_id">District ID</Label>
                  <Input
                    id="district_id"
                    type="text"
                    value={details.district_id}
                    onChange={(e) => setDetails({...details, district_id: e.target.value})}
                    placeholder="Enter district ID"
                  />
                </FormGroup>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormGroup>
                  <Label htmlFor="iep_date">Upcoming IEP Date</Label>
                  <Input
                    id="iep_date"
                    type="date"
                    value={details.upcoming_iep_date}
                    onChange={(e) => setDetails({...details, upcoming_iep_date: e.target.value})}
                  />
                </FormGroup>

                <FormGroup>
                  <Label htmlFor="triennial_date">Upcoming Triennial IEP Date</Label>
                  <Input
                    id="triennial_date"
                    type="date"
                    value={details.upcoming_triennial_date}
                    onChange={(e) => setDetails({...details, upcoming_triennial_date: e.target.value})}
                  />
                </FormGroup>
              </div>
            </div>
            
            {/* IEP Goals Section */}
            <div className="space-y-3 pt-4 border-t">
              <div className="space-y-1">
                <h4 className="font-medium text-gray-900">IEP Goals</h4>
                <p className="text-sm text-gray-600">
                  Add specific goals from the student's IEP
                </p>
              </div>
  
              <div className="space-y-2">
                <div className="flex justify-end">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setDetails({
                      ...details,
                      iep_goals: [...details.iep_goals, '']
                    })}
                    type="button"
                  >
                    + Add Goal
                  </Button>
                </div>
  
                {details.iep_goals.length === 0 ? (
                  <p className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-md">
                    No goals added yet
                  </p>
                ) : (
                  <div className="space-y-2">
                    {details.iep_goals.map((goal, index) => (
                      <div key={index} className="flex gap-2">
                        <textarea
                          value={goal}
                          onChange={(e) => {
                            const newGoals = [...details.iep_goals];
                            newGoals[index] = e.target.value;
                            setDetails({...details, iep_goals: newGoals});
                          }}
                          placeholder="Enter IEP goal..."
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[80px] resize-y"
                        />
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            const newGoals = details.iep_goals.filter((_, i) => i !== index);
                            setDetails({...details, iep_goals: newGoals});
                          }}
                          type="button"
                          className="self-start"
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
  
            {/* Working Skills Section */}
            <div className="space-y-3 pt-4 border-t">
              <div className="space-y-1">
                <h4 className="font-medium text-gray-900">Areas of Need</h4>
                <p className="text-sm text-gray-600">
                  Select the skills {student.initials} is currently working on
                </p>
              </div>
  
              <SkillsChecklist
                gradeLevel={studentInfo.grade_level}
                selectedSkills={details.working_skills}
                onSkillsChange={(skills) => setDetails({...details, working_skills: skills})}
              />
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Saving...' : 'Save Details'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}