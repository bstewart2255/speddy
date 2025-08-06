  'use client';

  import { useState } from 'react';
  import { createStudent } from '../../../lib/supabase/queries/students';
  import { Button } from '../ui/button';
  import { Label, Input, Select, FormGroup, FormSection, HelperText, ErrorMessage } from '../ui/form';

  interface AddStudentFormProps {
    onClose: () => void;
    onSuccess: () => void;
  }

  export function AddStudentForm({ onClose, onSuccess }: AddStudentFormProps) {
    const [formData, setFormData] = useState({
      initials: '',
      grade_level: '',
      teacher_name: '',
      sessions_per_week: 1,
      minutes_per_session: 30,
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setError('');
      setLoading(true);

      try {
        console.log('Creating student with data:', formData);

        // Create the student
        const student = await createStudent({
          initials: formData.initials.toUpperCase(),
          grade_level: formData.grade_level.trim(),
          teacher_name: formData.teacher_name,
          sessions_per_week: formData.sessions_per_week,
          minutes_per_session: formData.minutes_per_session,
        });

        console.log('Student created:', student);

        // Show success message with scheduling reminder
        alert(`Student "${student.initials}" has been added successfully!\n\nReminder: Go to the Schedule page and click "Re-schedule All Sessions" to schedule their sessions.`);

        onSuccess();
        onClose();
      } catch (err) {
        console.error('Error adding student:', err);
        setError(err instanceof Error ? err.message : 'Failed to add student');
      } finally {
        setLoading(false);
      }
    };
  
  return (
  <form onSubmit={handleSubmit} className="space-y-4">
    <FormSection title="Student Information" description="Enter the student's details below">
      <FormGroup>
        <Label htmlFor="initials" required>
          Student Initials
        </Label>
        <Input
          id="initials"
          type="text"
          value={formData.initials}
          onChange={(e) => setFormData({ ...formData, initials: e.target.value })}
          placeholder="e.g., JD"
          required
          maxLength={4}
        />
        <HelperText>Use only initials for privacy (2-4 characters)</HelperText>
      </FormGroup>

      <FormGroup>
        <Label htmlFor="grade_level" required>
          Grade Level
        </Label>
        <Select
          id="grade_level"
          value={formData.grade_level}
          onChange={(e) => setFormData({ ...formData, grade_level: e.target.value })}
          options={[
            { value: 'K', label: 'Kindergarten' },
            { value: '1', label: '1st Grade' },
            { value: '2', label: '2nd Grade' },
            { value: '3', label: '3rd Grade' },
            { value: '4', label: '4th Grade' },
            { value: '5', label: '5th Grade' },
            { value: '6', label: '6th Grade' },
            { value: '7', label: '7th Grade' },
            { value: '8', label: '8th Grade' },
          ]}
          placeholder="Select grade level"
          required
        />
      </FormGroup>

      <FormGroup>
        <Label htmlFor="teacher_name" required>
          Teacher Name
        </Label>
        <Input
          id="teacher_name"
          type="text"
          value={formData.teacher_name}
          onChange={(e) => setFormData({ ...formData, teacher_name: e.target.value })}
          placeholder="e.g., Smith"
          required
        />
      </FormGroup>
    </FormSection>

    <FormSection title="Service Requirements">
      <div className="grid grid-cols-2 gap-4">
        <FormGroup>
          <Label htmlFor="sessions_per_week" required>
            Sessions per Week
          </Label>
          <Input
            id="sessions_per_week"
            type="number"
            value={formData.sessions_per_week}
            onChange={(e) => setFormData({ ...formData, sessions_per_week: parseInt(e.target.value) })}
            min={1}
            max={10}
            required
          />
        </FormGroup>

        <FormGroup>
          <Label htmlFor="minutes_per_session" required>
            Minutes per Session
          </Label>
          <Select
            id="minutes_per_session"
            value={formData.minutes_per_session.toString()}
            onChange={(e) => setFormData({ ...formData, minutes_per_session: parseInt(e.target.value) })}            
            options={[
              { value: '15', label: '15 minutes' },
              { value: '20', label: '20 minutes' },
              { value: '25', label: '25 minutes' },
              { value: '30', label: '30 minutes' },
              { value: '35', label: '35 minutes' },
              { value: '40', label: '40 minutes' },
              { value: '45', label: '45 minutes' },
              { value: '50', label: '50 minutes' },
              { value: '55', label: '55 minutes' },
              { value: '60', label: '60 minutes' },
            ]}
            required
          />
        </FormGroup>
      </div>
    </FormSection>

    <div className="flex justify-end space-x-3 pt-4">
      <Button type="button" variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" isLoading={loading}>
        Add Student
      </Button>
    </div>
  </form>  
  );
}
