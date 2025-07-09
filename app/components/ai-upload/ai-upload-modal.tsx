// app/components/ai-upload/ai-upload-modal.tsx
'use client';

import { useState } from 'react';
import { Upload, X, AlertCircle, CheckCircle, Loader2, HelpCircle } from 'lucide-react';
import AIUploadExamples from './ai-upload-examples';

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
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setParsedData(null);
    setUploadResult(null);

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

    const confirmedData = parsedData.confirmed.filter((_, index) => selectedItems.has(index));

    if (confirmedData.length === 0) {
      alert('Please select at least one item to import');
      return;
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
        if (result.failedCount === 0) {
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

  const renderParsedItem = (item: any, index: number) => {
    if (uploadType === 'students') {
      return (
        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div className="flex-1">
            <span className="font-medium">{item.initials}</span>
            <span className="ml-2 text-gray-600">Grade {item.grade_level}</span>
            <span className="ml-2 text-gray-600">Teacher: {item.teacher_name}</span>
            <span className="ml-2 text-gray-500 text-sm">
              {item.sessions_per_week}x{item.minutes_per_session}min
            </span>
          </div>
          <input
            type="checkbox"
            checked={selectedItems.has(index)}
            onChange={() => toggleItem(index)}
            className="ml-4 h-4 w-4 text-blue-600 rounded"
          />
        </div>
      );
    } else if (uploadType === 'bell_schedule') {
      return (
        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div className="flex-1">
            <span className="font-medium">Grade {item.grade_level}</span>
            <span className="ml-2">{item.period_name}</span>
            <span className="ml-2 text-gray-600">
              {item.start_time} - {item.end_time}
            </span>
            <span className="ml-2 text-gray-500 text-sm">
              Days: {item.days?.join(', ') || 'All weekdays'}
            </span>
          </div>
          <input
            type="checkbox"
            checked={selectedItems.has(index)}
            onChange={() => toggleItem(index)}
            className="ml-4 h-4 w-4 text-blue-600 rounded"
          />
        </div>
      );
    } else {
      return (
        <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
          <div className="flex-1">
            <span className="font-medium">{item.teacher_name}</span>
            <span className="ml-2">{item.activity_name}</span>
            <span className="ml-2 text-gray-600">
              Day {item.day_of_week}: {item.start_time} - {item.end_time}
            </span>
          </div>
          <input
            type="checkbox"
            checked={selectedItems.has(index)}
            onChange={() => toggleItem(index)}
            className="ml-4 h-4 w-4 text-blue-600 rounded"
          />
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
              <p className="mt-1 text-sm text-green-700">
                Successfully imported {uploadResult.successCount} items
              </p>
            </div>

            {uploadResult.failedCount > 0 && (
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