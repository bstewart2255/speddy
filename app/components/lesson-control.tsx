'use client';

import { useState, useCallback } from 'react';

interface LessonControlProps {
  currentLesson: number;
  setCurrentLesson: (lesson: number) => void;
  curriculumType: string;
  curriculumLevel: string;
  /** Async function that returns the identifier (sessionId or groupId) */
  getIdentifier: () => Promise<string> | string;
  /** The key name for the identifier in the API request */
  identifierKey: 'sessionId' | 'groupId';
  /** Callback for error handling (e.g., showing toast) */
  onError?: (message: string) => void;
  /** Callback for successful save (optional) */
  onSave?: () => void;
  /** Size variant for styling */
  size?: 'small' | 'medium';
}

/**
 * A reusable lesson number control with increment/decrement arrows and an editable input.
 * Includes proper error handling, accessibility labels, and input validation.
 */
export function LessonControl({
  currentLesson,
  setCurrentLesson,
  curriculumType,
  curriculumLevel,
  getIdentifier,
  identifierKey,
  onError,
  onSave,
  size = 'small'
}: LessonControlProps) {
  const [isSaving, setIsSaving] = useState(false);

  const buttonSize = size === 'small' ? 'w-6 h-6 text-sm' : 'w-7 h-7';
  const inputSize = size === 'small' ? 'w-12 h-6 text-sm' : 'w-14 h-7 text-sm';
  const labelSize = size === 'small' ? 'text-xs' : 'text-sm';

  const saveLessonNumber = useCallback(async (newLesson: number): Promise<boolean> => {
    try {
      const identifier = await getIdentifier();
      const response = await fetch('/api/curriculum-tracking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [identifierKey]: identifier,
          curriculumType,
          curriculumLevel,
          currentLesson: newLesson
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save curriculum tracking');
      }

      onSave?.();
      return true;
    } catch (error) {
      console.error('Error saving lesson number:', error);
      onError?.('Failed to update lesson number');
      return false;
    }
  }, [getIdentifier, identifierKey, curriculumType, curriculumLevel, onError, onSave]);

  const handleDecrement = useCallback(async () => {
    if (currentLesson <= 1 || isSaving) return;

    const previousLesson = currentLesson;
    const newLesson = currentLesson - 1;

    // Optimistic update
    setCurrentLesson(newLesson);
    setIsSaving(true);

    const success = await saveLessonNumber(newLesson);

    if (!success) {
      // Revert on failure
      setCurrentLesson(previousLesson);
    }

    setIsSaving(false);
  }, [currentLesson, isSaving, setCurrentLesson, saveLessonNumber]);

  const handleIncrement = useCallback(async () => {
    if (isSaving) return;

    const previousLesson = currentLesson;
    const newLesson = currentLesson + 1;

    // Optimistic update
    setCurrentLesson(newLesson);
    setIsSaving(true);

    const success = await saveLessonNumber(newLesson);

    if (!success) {
      // Revert on failure
      setCurrentLesson(previousLesson);
    }

    setIsSaving(false);
  }, [currentLesson, isSaving, setCurrentLesson, saveLessonNumber]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Clamp to minimum of 1
    const value = Math.max(1, parseInt(e.target.value) || 1);
    setCurrentLesson(value);
  }, [setCurrentLesson]);

  const handleInputBlur = useCallback(async () => {
    if (isSaving) return;

    setIsSaving(true);
    await saveLessonNumber(currentLesson);
    setIsSaving(false);
  }, [currentLesson, isSaving, saveLessonNumber]);

  return (
    <div className="flex items-center gap-1">
      <span className={`${labelSize} text-gray-600 mr-1`}>Lesson</span>
      <button
        onClick={handleDecrement}
        disabled={currentLesson <= 1 || isSaving}
        aria-label="Decrease lesson number"
        className={`${buttonSize} flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        ←
      </button>
      <input
        type="number"
        min="1"
        value={currentLesson}
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        disabled={isSaving}
        aria-label="Current lesson number"
        className={`${inputSize} text-center border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50`}
      />
      <button
        onClick={handleIncrement}
        disabled={isSaving}
        aria-label="Increase lesson number"
        className={`${buttonSize} flex items-center justify-center bg-gray-200 hover:bg-gray-300 rounded text-gray-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        →
      </button>
    </div>
  );
}
