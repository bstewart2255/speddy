'use client';

import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input, Label, FormGroup } from '../ui/form';
import { StudentTag, GradeTag } from '../ui/tag';
import { getTeacherDetails, upsertTeacherDetails, getTeacherByStudentTeacherName, TeacherDetails } from '../../../lib/supabase/queries/teacher-details';
import { getOrCreateTeacher } from '../../../lib/supabase/queries/teachers';
import type { Database } from '../../../src/types/database';

type Teacher = Database['public']['Tables']['teachers']['Row'];
type Student = Database['public']['Tables']['students']['Row'];

interface TeacherDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  teacherName: string;
  onSave?: (teacher: Teacher) => void;
  onStudentClick?: (student: Pick<Student, 'id' | 'initials' | 'grade_level' | 'teacher_name' | 'sessions_per_week' | 'minutes_per_session'>) => void;
}

export function TeacherDetailsModal({ 
  isOpen, 
  onClose, 
  teacherName,
  onSave,
  onStudentClick
}: TeacherDetailsModalProps) {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [assignedStudents, setAssignedStudents] = useState<TeacherDetails['assigned_students']>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    classroom_number: '',
    phone_number: '',
  });

  useEffect(() => {
    const loadTeacherData = async () => {
      setLoading(true);
      try {
        const existingTeacher = await getTeacherByStudentTeacherName(teacherName);
        
        if (existingTeacher) {
          const details = await getTeacherDetails(existingTeacher.id);
          if (details) {
            setTeacher(existingTeacher);
            setAssignedStudents(details.assigned_students);
            setFormData({
              first_name: details.first_name || '',
              last_name: details.last_name || '',
              email: details.email || '',
              classroom_number: details.classroom_number || '',
              phone_number: details.phone_number || '',
            });
          }
        } else {
          const nameParts = teacherName.trim().split(' ');
          const lastName = nameParts[nameParts.length - 1] || '';
          const firstName = nameParts.slice(0, -1).join(' ') || '';
          
          setFormData({
            first_name: firstName,
            last_name: lastName || teacherName,
            email: '',
            classroom_number: '',
            phone_number: '',
          });
          setAssignedStudents([]);
        }
      } catch (error) {
        console.error('Error loading teacher data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen && teacherName) {
      loadTeacherData();
    }
  }, [isOpen, teacherName]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let savedTeacher: Teacher;
      
      if (teacher) {
        savedTeacher = await upsertTeacherDetails(teacher.id, {
          first_name: formData.first_name || null,
          last_name: formData.last_name || null,
          email: formData.email || null,
          classroom_number: formData.classroom_number || null,
          phone_number: formData.phone_number || null,
          school_id: teacher.school_id,
          school_site: teacher.school_site,
        });
      } else {
        savedTeacher = await getOrCreateTeacher(
          formData.first_name || formData.last_name ? 
          `${formData.first_name} ${formData.last_name}`.trim() : 
          teacherName
        );
        
        if (formData.email || formData.classroom_number || formData.phone_number) {
          savedTeacher = await upsertTeacherDetails(savedTeacher.id, {
            first_name: formData.first_name || null,
            last_name: formData.last_name || null,
            email: formData.email || null,
            classroom_number: formData.classroom_number || null,
            phone_number: formData.phone_number || null,
            school_site: savedTeacher.school_site,
            school_id: savedTeacher.school_id,
          });
        }
      }

      if (onSave) {
        onSave(savedTeacher);
      }
      onClose();
    } catch (error) {
      console.error('Error saving teacher:', error);
      alert('Failed to save teacher details. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const formatPhoneNumber = (value: string) => {
    const phoneNumber = value.replace(/[^\d]/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength < 4) return phoneNumber;
    if (phoneNumberLength < 7) {
      return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
    }
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value);
    setFormData({ ...formData, phone_number: formatted });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" 
          onClick={onClose}
        />

        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full">
          <div className="flex items-center justify-between p-6 border-b">
            <h2 className="text-xl font-semibold text-gray-900">
              Teacher Details: {formData.first_name || formData.last_name ? 
                `${formData.first_name || ''} ${formData.last_name || ''}`.trim() : 
                teacherName}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500 text-2xl font-light leading-none pb-1"
            >
              ×
            </button>
          </div>

          <div className="p-6 space-y-6">
            {loading ? (
              <div className="flex justify-center py-8">
                <p>Loading teacher details...</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  <h3 className="font-medium text-gray-900">Teacher Information</h3>

                  <div className="grid grid-cols-2 gap-4">
                    <FormGroup>
                      <Label htmlFor="first_name">First Name *</Label>
                      <Input
                        id="first_name"
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                        placeholder="Enter first name"
                        required
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="last_name">Last Name *</Label>
                      <Input
                        id="last_name"
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                        placeholder="Enter last name"
                        required
                      />
                    </FormGroup>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormGroup>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        placeholder="teacher@school.edu"
                      />
                    </FormGroup>

                    <FormGroup>
                      <Label htmlFor="classroom_number">Classroom Number</Label>
                      <Input
                        id="classroom_number"
                        type="text"
                        value={formData.classroom_number}
                        onChange={(e) => setFormData({...formData, classroom_number: e.target.value})}
                        placeholder="Room 101"
                      />
                    </FormGroup>
                  </div>

                  <FormGroup>
                    <Label htmlFor="phone_number">Phone Number</Label>
                    <Input
                      id="phone_number"
                      type="tel"
                      value={formData.phone_number}
                      onChange={handlePhoneChange}
                      placeholder="(555) 123-4567"
                      maxLength={14}
                    />
                  </FormGroup>
                </div>

                <div className="space-y-3 pt-4 border-t">
                  <div className="space-y-1">
                    <h4 className="font-medium text-gray-900">Other Students</h4>
                    <p className="text-sm text-gray-600">
                      Students assigned to this teacher
                    </p>
                  </div>

                  {assignedStudents.length === 0 ? (
                    <p className="text-sm text-gray-500 italic py-4 text-center bg-gray-50 rounded-md">
                      No students currently assigned
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                      {assignedStudents.map((student) => (
                        <button
                          key={student.id}
                          onClick={() => {
                            if (onStudentClick) {
                              onStudentClick({
                                id: student.id,
                                initials: student.initials,
                                grade_level: student.grade_level,
                                teacher_name: teacherName,
                                sessions_per_week: student.sessions_per_week,
                                minutes_per_session: student.minutes_per_session
                              });
                              onClose();
                            }
                          }}
                          className="flex items-center gap-2 p-2 rounded-md hover:bg-gray-50 transition-colors text-left"
                        >
                          <StudentTag initials={student.initials} />
                          <span className="text-sm text-gray-600">- Grade</span>
                          <GradeTag grade={student.grade_level} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          
          <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              variant="primary" 
              onClick={handleSave}
              disabled={saving || loading || !formData.last_name}
            >
              {saving ? 'Saving...' : 'Save Details'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}