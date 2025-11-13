// app/components/ai-upload/ai-upload-modal.tsx
'use client';

import { useState } from 'react';
import { Upload, X, AlertCircle, CheckCircle, Loader2, HelpCircle } from 'lucide-react';
import AIUploadExamples from './ai-upload-examples';
import { TeacherAutocomplete } from '../teachers/teacher-autocomplete';

interface AIUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  uploadType: 'students' | 'bell_schedule' | 'special_activities';
  onSuccess: () => void;
}

interface ParsedData {
  confirmed: any[];
  ambiguous: any[];
  errors: string[];
}

export default function AIUploadModal({ 
  isOpen, 
  onClose, 
  uploadType, 
  onSuccess 
}: AIUploadModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedData | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [showExamples, setShowExamples] = useState(false);
  const [editedItems, setEditedItems] = useState<{[key: number]: any}>({});

  if (!isOpen) return null;

  const uploadTypeLabels = {
    students: 'Students',
    bell_schedule: 'Bell Schedule',
    special_activities: 'Special Activities'
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setParsedData(null);
      setUploadResult(null);
      setEditedItems({}); // Reset edited items when new file is selected
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setParsedData(null);
    setUploadResult(null);
    setEditedItems({}); // Reset edited items when processing new upload

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', uploadType);

      const response = await fetch('/api/ai-upload', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (response.ok && result.data) {
        setParsedData(result.data);
        // Pre-select all confirmed items
        setSelectedItems(new Set(result.data.confirmed.map((_: any, i: number) => i)));
      } else {
        alert(result.error || 'Failed to process file');
      }
    } catch (error) {
      alert('Error uploading file. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!parsedData) return;

    // Use edited data if available, otherwise use original data
    const confirmedData = parsedData.confirmed
      .map((item, index) => selectedItems.has(index) ? getCurrentItemData(item, index) : null)
      .filter(item => item !== null);

    if (confirmedData.length === 0) {
      alert('Please select at least one item to import');
      return;
    }

    // Validate that all items requiring teachers have teacher_id set
    if (uploadType === 'students' || uploadType === 'special_activities') {
      const itemsMissingTeacher = confirmedData.filter((item: any) => !item?.teacher_id);
      if (itemsMissingTeacher.length > 0) {
        alert(
          `Cannot import: ${itemsMissingTeacher.length} item(s) are missing teacher assignment.\n\n` +
          `Please use the teacher dropdown to select an existing teacher for each item before importing.`
        );
        return;
      }
    }

    setConfirming(true);

    try {
      const response = await fetch('/api/ai-upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadType,
          confirmedData
        })
      });

      const result = await response.json();

      if (response.ok) {
        setUploadResult(result);
        const failedCount = result.summary?.failed || result.failedCount || 0;
        if (failedCount === 0) {
          setTimeout(() => {
            onSuccess();
            handleClose();
          }, 2000);
        }
      } else {
        alert(result.error || 'Failed to import data');
      }
    } catch (error) {
      alert('Error importing data. Please try again.');
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedData(null);
    setSelectedItems(new Set());
    setEditedItems({}); // Reset edited items
    setUploadResult(null);
    onClose();
  };

  const toggleItem = (index: number) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
  };

  // Helper function to get current item data (original or edited)
  const getCurrentItemData = (item: any, index: number) => {
    return editedItems[index] ? { ...item, ...editedItems[index] } : item;
  };

  // Helper function to update an edited item
  const updateEditedItem = (index: number, field: string, value: any) => {
    setEditedItems(prev => ({
      ...prev,
      [index]: {
        ...getCurrentItemData(parsedData!.confirmed[index], index),
        [field]: value
      }
    }));
  };

  // Helper function to update teacher fields (both ID and name)
  const updateTeacherForItem = (index: number, teacherId: string | null, teacherName: string | null) => {
    setEditedItems(prev => ({
      ...prev,
      [index]: {
        ...getCurrentItemData(parsedData!.confirmed[index], index),
        teacher_id: teacherId,
        teacher_name: teacherName
      }
    }));
  };

  const renderParsedItem = (item: any, index: number) => {
    const currentData = getCurrentItemData(item, index);
    const isEdited = editedItems[index] !== undefined;

    if (uploadType === 'students') {
      return (
        <div key={index} className={`p-3 rounded ${isEdited ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
          {isEdited && (
            <div className="text-xs text-blue-600 mb-2 flex items-center">
              <span className="mr-1">✏️</span> Edited
            </div>
          )}
          <div className="grid grid-cols-6 gap-2 items-center">
            <div>
              <label className="text-xs text-gray-600">Initials</label>
              <input
                type="text"
                value={currentData.initials || ''}
                onChange={(e) => updateEditedItem(index, 'initials', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
                maxLength={4}
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Grade</label>
              <select
                value={currentData.grade_level || ''}
                onChange={(e) => updateEditedItem(index, 'grade_level', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="TK">TK</option>
                <option value="K">K</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="6">6</option>
                <option value="7">7</option>
                <option value="8">8</option>
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-600">Teacher</label>
              <TeacherAutocomplete
                value={currentData.teacher_id || null}
                teacherName={currentData.teacher_name || undefined}
                onChange={(teacherId, teacherName) => updateTeacherForItem(index, teacherId, teacherName)}
                placeholder="Search..."
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Sessions/Week</label>
              <input
                type="number"
                min="1"
                max="5"
                value={currentData.sessions_per_week || ''}
                onChange={(e) => updateEditedItem(index, 'sessions_per_week', parseInt(e.target.value))}
                className="w-full text-sm border rounded px-2 py-1"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Minutes</label>
              <select
                value={currentData.minutes_per_session || ''}
                onChange={(e) => updateEditedItem(index, 'minutes_per_session', parseInt(e.target.value))}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="15">15</option>
                <option value="20">20</option>
                <option value="25">25</option>
                <option value="30">30</option>
                <option value="35">35</option>
                <option value="40">40</option>
                <option value="45">45</option>
                <option value="50">50</option>
                <option value="55">55</option>
                <option value="60">60</option>
              </select>
            </div>
            
            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={selectedItems.has(index)}
                onChange={() => toggleItem(index)}
                className="h-4 w-4 text-blue-600 rounded"
              />
            </div>
          </div>
        </div>
      );
    } else if (uploadType === 'bell_schedule') {
      return (
        <div key={index} className={`p-3 rounded ${isEdited ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
          {isEdited && (
            <div className="text-xs text-blue-600 mb-2 flex items-center">
              <span className="mr-1">✏️</span> Edited
            </div>
          )}
          <div className="grid grid-cols-6 gap-2 items-center">
            <div>
              <label className="text-xs text-gray-600">Grade</label>
              <select
                value={currentData.grade_level || ''}
                onChange={(e) => updateEditedItem(index, 'grade_level', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="TK">TK</option>
                <option value="K">K</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
                <option value="1,2">1,2</option>
                <option value="3,4,5">3,4,5</option>
              </select>
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Activity</label>
              <input
                type="text"
                value={currentData.period_name || ''}
                onChange={(e) => updateEditedItem(index, 'period_name', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Start Time</label>
              <input
                type="time"
                value={currentData.start_time || ''}
                onChange={(e) => updateEditedItem(index, 'start_time', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-600">End Time</label>
              <input
                type="time"
                value={currentData.end_time || ''}
                onChange={(e) => updateEditedItem(index, 'end_time', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Days</label>
              <input
                type="text"
                value={currentData.days?.join(',') || ''}
                onChange={(e) => updateEditedItem(index, 'days', e.target.value.split(',').map(d => parseInt(d.trim())))}
                className="w-full text-sm border rounded px-2 py-1"
                placeholder="1,2,3,4,5"
              />
            </div>
            
            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={selectedItems.has(index)}
                onChange={() => toggleItem(index)}
                className="h-4 w-4 text-blue-600 rounded"
              />
            </div>
          </div>
        </div>
      );
    } else {
      return (
        <div key={index} className={`p-3 rounded ${isEdited ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50'}`}>
          {isEdited && (
            <div className="text-xs text-blue-600 mb-2 flex items-center">
              <span className="mr-1">✏️</span> Edited
            </div>
          )}
          <div className="grid grid-cols-5 gap-2 items-center">
            <div>
              <label className="text-xs text-gray-600">Teacher</label>
              <TeacherAutocomplete
                value={currentData.teacher_id || null}
                teacherName={currentData.teacher_name || undefined}
                onChange={(teacherId, teacherName) => updateTeacherForItem(index, teacherId, teacherName)}
                placeholder="Search..."
                className="text-sm"
              />
            </div>

            <div>
              <label className="text-xs text-gray-600">Activity</label>
              <input
                type="text"
                value={currentData.activity_name || ''}
                onChange={(e) => updateEditedItem(index, 'activity_name', e.target.value)}
                className="w-full text-sm border rounded px-2 py-1"
              />
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Day</label>
              <select
                value={currentData.day_of_week || ''}
                onChange={(e) => updateEditedItem(index, 'day_of_week', parseInt(e.target.value))}
                className="w-full text-sm border rounded px-2 py-1"
              >
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
              </select>
            </div>
            
            <div>
              <label className="text-xs text-gray-600">Start-End</label>
              <div className="flex gap-1">
                <input
                  type="time"
                  value={currentData.start_time || ''}
                  onChange={(e) => updateEditedItem(index, 'start_time', e.target.value)}
                  className="w-full text-xs border rounded px-1 py-1"
                />
                <input
                  type="time"
                  value={currentData.end_time || ''}
                  onChange={(e) => updateEditedItem(index, 'end_time', e.target.value)}
                  className="w-full text-xs border rounded px-1 py-1"
                />
              </div>
            </div>
            
            <div className="flex justify-center">
              <input
                type="checkbox"
                checked={selectedItems.has(index)}
                onChange={() => toggleItem(index)}
                className="h-4 w-4 text-blue-600 rounded"
              />
            </div>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium">
            AI Upload - {uploadTypeLabels[uploadType]}
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowExamples(true)}
              className="text-gray-400 hover:text-gray-500 p-1"
              title="Show examples"
            >
              <HelpCircle className="h-5 w-5" />
            </button>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* File Upload Section */}
        {!parsedData && !uploadResult && (
          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-2 text-sm text-gray-600">
                Upload a file containing {uploadTypeLabels[uploadType].toLowerCase()} data
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Supported: CSV, Excel (.xlsx, .xls), Word (.docx, .doc), PDF, Text files
              </p>
              <div className="mt-2 text-xs text-gray-400 space-y-1">
                <p>• Excel: All sheets will be processed</p>
                <p>• PDF/Word: Tables and lists will be extracted</p>
                <p>• Can handle various formats - structured or unstructured</p>
              </div>
              <input
                type="file"
                accept=".csv,.txt,.doc,.docx,.xls,.xlsx,.pdf"
                onChange={handleFileSelect}
                className="hidden"
                id="ai-file-upload"
              />
              <label
                htmlFor="ai-file-upload"
                className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 cursor-pointer"
              >
                Choose File
              </label>
              {file && (
                <p className="mt-2 text-sm text-gray-700">
                  Selected: {file.name}
                </p>
              )}
            </div>

            {file && (
              <div className="flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Processing...
                    </>
                  ) : (
                    'Process File'
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Parsed Data Review */}
        {parsedData && !uploadResult && (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {parsedData.confirmed.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center">
                  <CheckCircle className="h-5 w-5 text-green-500 mr-2" />
                  Ready to Import ({parsedData.confirmed.length})
                </h4>
                <div className="space-y-2">
                  {parsedData.confirmed.map((item, index) => renderParsedItem(item, index))}
                </div>
              </div>
            )}

            {parsedData.ambiguous.length > 0 && parsedData.ambiguous.some((item: any) => item.original) && (
              <div>
                <h4 className="font-medium mb-2 flex items-center">
                  <AlertCircle className="h-5 w-5 text-yellow-500 mr-2" />
                  Need Review ({parsedData.ambiguous.filter((item: any) => item.original).length})
                </h4>
                <div className="space-y-2">
                  {parsedData.ambiguous.map((item: any, index: number) => (
                    item.original ? (
                      <div key={index} className="p-3 bg-yellow-50 rounded">
                        <p className="text-sm font-medium">Original: {item.original}</p>
                        <p className="text-sm text-gray-600">Suggested: {JSON.stringify(item.suggested)}</p>
                        <p className="text-sm text-yellow-700">Reason: {item.reason}</p>
                      </div>
                    ) : null
                  ))}
                </div>
              </div>
            )}

            {parsedData.errors.length > 0 && (
              <div>
                <h4 className="font-medium mb-2 flex items-center">
                  <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                  Errors ({parsedData.errors.length})
                </h4>
                <div className="space-y-1">
                  {parsedData.errors.map((error, index) => (
                    <p key={index} className="text-sm text-red-600">{error}</p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t">
              <p className="text-sm text-gray-600">
                {selectedItems.size} of {parsedData.confirmed.length} items selected
              </p>
              <div className="space-x-3">
                <button
                  onClick={() => setParsedData(null)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={confirming || selectedItems.size === 0}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {confirming ? (
                    <>
                      <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
                      Importing...
                    </>
                  ) : (
                    `Import ${selectedItems.size} Items`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Upload Result */}
        {uploadResult && (
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <h4 className="font-medium text-green-800 flex items-center">
                <CheckCircle className="h-5 w-5 mr-2" />
                Import Complete
              </h4>
              {uploadResult.summary ? (
                <div className="mt-1 text-sm text-green-700">
                  <p>Total processed: {uploadResult.summary.total}</p>
                  <p>Added: {uploadResult.summary.inserted}</p>
                  <p>Updated: {uploadResult.summary.updated}</p>
                  {uploadResult.summary.skipped > 0 && (
                    <p>Skipped (duplicates): {uploadResult.summary.skipped}</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-sm text-green-700">
                  Successfully imported {uploadResult.successCount} items
                </p>
              )}
            </div>

            {((uploadResult.summary?.failed || uploadResult.failedCount || 0) > 0) && (
              <div className="p-4 rounded-lg bg-red-50 border border-red-200">
                <h4 className="font-medium text-red-800 flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Some items failed to import
                </h4>
                <div className="mt-2 space-y-1">
                  {uploadResult.failedItems.map((failed: any, index: number) => (
                    <p key={index} className="text-sm text-red-700">
                      {JSON.stringify(failed.item)} - {failed.error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleClose}
                className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      <AIUploadExamples 
        isOpen={showExamples}
        onClose={() => setShowExamples(false)}
        uploadType={uploadType}
      />
    </div>
  );
}