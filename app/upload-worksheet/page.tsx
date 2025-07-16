// app/upload-worksheet/page.tsx
'use client';

import { useState } from 'react';
import { Upload, Send, Loader2, Camera, Info } from 'lucide-react';

export default function UploadWorksheetPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type.startsWith('image/')) {
      setFile(selectedFile);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;

        // Send to your API
        const response = await fetch('/api/submit-worksheet', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            image: base64,
            filename: file.name,
            mimetype: file.type,
          }),
        });

        const data = await response.json();

        if (response.ok) {
          setResult({
            success: true,
            message: `Worksheet processed successfully!`,
            accuracy: data.accuracy,
            studentInitials: data.studentInitials,
            worksheetType: data.worksheetType
          });
        } else {
          setResult({
            success: false,
            message: data.error || 'Failed to process worksheet'
          });
        }
      };

      reader.readAsDataURL(file);
    } catch (error) {
      setResult({
        success: false,
        message: 'Error uploading worksheet. Please try again.'
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Upload Completed Worksheet</h1>

        {/* New QR Scan Tip */}
        <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
          <div className="flex">
            <div className="flex-shrink-0">
              <Camera className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> For faster uploads, teachers can scan the QR code on the worksheet with their phone camera!
              </p>
            </div>
          </div>
        </div>

        {/* Upload Methods Explanation */}
        <div className="bg-gray-50 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Info className="w-5 h-5" />
            Two Ways to Upload Worksheets
          </h2>
          <div className="space-y-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-1">
                <Camera className="w-4 h-4 inline mr-2 text-blue-600" />
                QR Scan Upload (Recommended)
              </h3>
              <p className="text-sm text-gray-600">
                Simply scan the QR code on the worksheet with your phone camera. No login required!
              </p>
              <ul className="mt-2 text-sm text-gray-500 list-disc list-inside">
                <li>Faster and easier</li>
                <li>Works on any phone</li>
                <li>No app download needed</li>
              </ul>
            </div>
            
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <h3 className="font-medium text-gray-900 mb-1">
                <Upload className="w-4 h-4 inline mr-2 text-gray-600" />
                Direct Upload (You're here)
              </h3>
              <p className="text-sm text-gray-600">
                Upload worksheet photos directly from your device. Requires login.
              </p>
              <ul className="mt-2 text-sm text-gray-500 list-disc list-inside">
                <li>Upload multiple worksheets at once</li>
                <li>Access upload history</li>
                <li>Best for desktop use</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="space-y-6">
            {/* File Upload Area */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              {preview ? (
                <div className="space-y-4">
                  <img 
                    src={preview} 
                    alt="Worksheet preview" 
                    className="max-w-full max-h-96 mx-auto rounded"
                  />
                  <button
                    onClick={() => {
                      setFile(null);
                      setPreview('');
                      setResult(null);
                    }}
                    className="text-sm text-red-600 hover:text-red-800"
                  >
                    Remove image
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="w-12 h-12 text-gray-400 mx-auto" />
                  <div>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <span className="text-blue-600 hover:text-blue-800 font-medium">
                        Click to upload
                      </span>
                      <span className="text-gray-600"> or drag and drop</span>
                    </label>
                    <input
                      id="file-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </div>
                  <p className="text-sm text-gray-500">PNG, JPG up to 10MB</p>
                </div>
              )}
            </div>

            {/* Upload Button */}
            {file && !result && (
              <button
                onClick={handleUpload}
                disabled={uploading}
                className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium rounded-lg flex items-center justify-center gap-2"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing worksheet...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Submit Worksheet
                  </>
                )}
              </button>
            )}

            {/* Result Display */}
            {result && (
              <div className={`p-4 rounded-lg ${
                result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <h3 className={`font-semibold mb-2 ${
                  result.success ? 'text-green-900' : 'text-red-900'
                }`}>
                  {result.success ? '✓ Success!' : '✗ Error'}
                </h3>
                <p className={result.success ? 'text-green-800' : 'text-red-800'}>
                  {result.message}
                </p>
                {result.success && (
                  <div className="mt-3 space-y-1 text-sm text-green-700">
                    <p><strong>Student:</strong> {result.studentInitials}</p>
                    <p><strong>Worksheet Type:</strong> {result.worksheetType}</p>
                    <p><strong>Accuracy:</strong> {result.accuracy}%</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-blue-50 rounded-lg p-6">
          <h2 className="font-semibold text-blue-900 mb-2">Instructions for Direct Upload</h2>
          <ol className="list-decimal list-inside space-y-1 text-blue-800">
            <li>Take a clear photo of the completed worksheet</li>
            <li>Make sure the QR code is visible in the image</li>
            <li>Upload the image using the form above</li>
            <li>The system will automatically process and grade the worksheet</li>
          </ol>
          
          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-sm text-blue-700">
              <strong>Alternative:</strong> For a quicker option, simply scan the QR code on the worksheet with your phone camera. 
              It will open a page where you can instantly upload the worksheet photo without logging in!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}