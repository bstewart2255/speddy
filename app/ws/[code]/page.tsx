'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Database } from '@/src/types/database';
import { compressImage, validateImageFile, extractImageMetadata } from '@/lib/image-utils';
import { trackEvent, getDeviceType } from '@/lib/analytics-client';
import { 
  testConnectivity, 
  analyzeNetworkError, 
  fetchWithRetry, 
  logConnectivityDebugInfo,
  getErrorMessageWithTips,
  type ConnectivityTestResult,
  type DetailedNetworkError 
} from '@/lib/connectivity-utils';

type Worksheet = Database['public']['Tables']['worksheets']['Row'];
type Student = Database['public']['Tables']['students']['Row'];

interface WorksheetWithStudent extends Worksheet {
  students: Pick<Student, 'initials' | 'grade_level'> | null;
}

type ErrorType = 'network' | 'rate_limit' | 'qr_mismatch' | 'not_found' | 'generic' | 'unknown';

interface UploadError {
  type: ErrorType;
  message: string;
  details?: DetailedNetworkError;
  showTroubleshooting?: boolean;
}

// Constants for retry logic
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

export default function WorksheetUploadPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  
  const [worksheet, setWorksheet] = useState<WorksheetWithStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<UploadError | null>(null);
  const [remainingUploads, setRemainingUploads] = useState<number | null>(null);
  const [processingImage, setProcessingImage] = useState(false);
  const [progressMessage, setProgressMessage] = useState('Processing worksheet...');
  const [connectivityStatus, setConnectivityStatus] = useState<ConnectivityTestResult | null>(null);
  const [showConnectivityTest, setShowConnectivityTest] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const redirectTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    fetchWorksheet();
    
    // Track page load
    trackEvent({
      event: 'qr_upload_started',
      worksheetCode: code,
      deviceType: getDeviceType(navigator.userAgent),
      userAgent: navigator.userAgent,
      metadata: {
        referrer: document.referrer,
        timestamp: new Date().toISOString()
      }
    });
  }, [code]);

  useEffect(() => {
    if (uploadSuccess) {
      // Set up auto-redirect after 5 seconds
      redirectTimerRef.current = setTimeout(() => {
        router.push('/');
      }, 5000);
    }

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, [uploadSuccess, router]);

  const fetchWorksheet = async () => {
    try {
      const supabase = createClient<Database>();
      
      const { data, error } = await supabase
        .from('worksheets')
        .select(`
          *,
          students:student_id (
            initials,
            grade_level
          )
        `)
        .eq('qr_code', code)
        .single();

      if (error || !data) {
        // Check if this might be a legacy worksheet code (old format: WS-timestamp)
        const isLegacyFormat = /^WS-\d{13}$/.test(code);
        
        if (isLegacyFormat) {
          // Create a placeholder worksheet record for legacy codes
          const placeholderWorksheet: WorksheetWithStudent = {
            id: `legacy-${code}`,
            lesson_id: 'legacy-lesson',
            student_id: 'legacy-student',
            worksheet_type: 'legacy',
            content: { title: 'Legacy Worksheet', instructions: 'Scanned worksheet' },
            answer_key: null,
            qr_code: code,
            uploaded_file_path: null,
            uploaded_at: null,
            created_at: new Date().toISOString(),
            students: {
              initials: 'Legacy Student',
              grade_level: 'Unknown'
            }
          };
          
          setWorksheet(placeholderWorksheet);
          setError(null);
          setLoading(false);
          return;
        }
        
        setError('This QR code is invalid. Please check you\'re scanning a Speddy worksheet.');
        setLoading(false);
        return;
      }

      setWorksheet(data as WorksheetWithStudent);
      setLoading(false);
    } catch (err) {
      setError('An error occurred while loading the worksheet.');
      setLoading(false);
    }
  };

  const handleImageSelect = async (file: File, method: 'camera' | 'gallery') => {
    // Validate the image file
    const validation = validateImageFile(file);
    if (!validation.valid) {
      setError(validation.error || 'Invalid image file');
      return;
    }

    setProcessingImage(true);
    setError(null);

    try {
      // Track image selection
      trackEvent({
        event: 'qr_upload_image_selected',
        worksheetCode: code,
        method: method,
        fileSize: file.size,
        deviceType: getDeviceType(navigator.userAgent),
        metadata: {
          fileType: file.type,
          fileName: file.name
        }
      });

      // Extract metadata for logging
      const metadata = await extractImageMetadata(file);
      console.log('Image metadata:', metadata);

      // Compress image if needed
      const compressed = await compressImage(file, 2); // 2MB max
      
      // Convert Blob to File to maintain file name
      const compressedFile = new File([compressed], file.name, {
        type: 'image/jpeg',
        lastModified: Date.now(),
      });

      setSelectedImage(compressedFile);
      setImagePreview(URL.createObjectURL(compressedFile));
      setError(null);
    } catch (err) {
      console.error('Image processing error:', err);
      setError('Failed to process image. Please try another photo.');
    } finally {
      setProcessingImage(false);
    }
  };


  const handleUpload = async () => {
    if (!selectedImage || !worksheet) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setProgressMessage('Processing worksheet...');

    const startTime = Date.now();

    try {
      // Create FormData
      const formData = new FormData();
      formData.append('image', selectedImage);
      formData.append('qr_code', worksheet.qr_code);
      formData.append('source', 'qr_scan_upload');

      // Update progress messages
      const messageInterval = setInterval(() => {
        setUploadProgress((prev) => {
          const newProgress = Math.min(prev + 10, 90);
          if (newProgress >= 50) {
            setProgressMessage('Almost done...');
          }
          if (newProgress >= 80) {
            setProgressMessage('Finalizing...');
          }
          return newProgress;
        });
      }, 200);

      // Upload via API route with enhanced error handling
      const response = await fetchWithRetry('/api/submit-worksheet', {
        method: 'POST',
        body: formData,
      }, MAX_RETRIES, BASE_DELAY_MS);

      clearInterval(messageInterval);
      setUploadProgress(100);

      const result = await response.json();

      if (!response.ok) {
        let errorType: ErrorType = 'generic';
        let errorMessage = result.error || 'Upload failed';

        if (response.status === 429) {
          errorType = 'rate_limit';
          errorMessage = "You've uploaded many worksheets recently. Please try again in an hour.";
          setRemainingUploads(result.remainingUploads || 0);
        } else if (response.status === 404) {
          errorType = 'not_found';
          errorMessage = "This QR code is invalid. Please check you're scanning a Speddy worksheet.";
        } else if (result.error?.includes('doesn\'t match')) {
          errorType = 'qr_mismatch';
          errorMessage = "The photo doesn't match this worksheet. Please make sure you're uploading the correct worksheet.";
        } else if (response.status >= 500) {
          errorType = 'network';
          errorMessage = 'Upload failed. Please check your connection and try again.';
        }

        setUploadError({ type: errorType, message: errorMessage });
        throw new Error(errorMessage);
      }

      // Update remaining uploads count from headers
      const remainingFromHeader = response.headers.get('X-RateLimit-Remaining');
      if (remainingFromHeader) {
        setRemainingUploads(parseInt(remainingFromHeader));
      }

      // Track successful upload
      const processingTime = Date.now() - startTime;
      trackEvent({
        event: 'qr_upload_completed',
        worksheetCode: code,
        fileSize: selectedImage.size,
        processingTime: processingTime,
        deviceType: getDeviceType(navigator.userAgent),
        metadata: {
          remainingUploads: remainingFromHeader ? parseInt(remainingFromHeader) : null
        }
      });

      setUploadSuccess(true);

    } catch (err: any) {
      console.error('Upload error:', err);
      
      // Analyze the error for detailed debugging
      const detailedError = analyzeNetworkError(err, '/api/submit-worksheet');
      logConnectivityDebugInfo(detailedError, { 
        worksheetCode: code, 
        fileSize: selectedImage.size,
        userAgent: navigator.userAgent
      });
      
      // Track failed upload with enhanced error info
      const processingTime = Date.now() - startTime;
      
      trackEvent({
        event: 'qr_upload_failed',
        worksheetCode: code,
        fileSize: selectedImage.size,
        processingTime: processingTime,
        errorCode: detailedError.type,
        errorMessage: detailedError.message,
        deviceType: getDeviceType(navigator.userAgent),
        metadata: {
          statusCode: detailedError.details.statusCode,
          retryable: detailedError.retryable,
          networkType: detailedError.details.networkInfo?.effectiveType || 'unknown',
          isOnline: navigator.onLine
        }
      });
      
      // Set detailed error information
      if (!uploadError) {
        const mappedType: ErrorType =
          detailedError.details.statusCode === 404
            ? 'not_found'
            : detailedError.type === 'rate_limit'
            ? 'rate_limit'
            : (['network', 'timeout', 'cors', 'server'].includes(detailedError.type) ? 'network' : 'unknown') as ErrorType;
        setUploadError({
          type: mappedType,
          message: detailedError.userFriendlyMessage,
          details: detailedError,
          showTroubleshooting: true
        });
      }
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const clearSelection = () => {
    setSelectedImage(null);
    setImagePreview(null);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const resetUpload = () => {
    clearSelection();
    setUploadSuccess(false);
    setUploadError(null);
    setConnectivityStatus(null);
    setShowConnectivityTest(false);
    if (redirectTimerRef.current) {
      clearTimeout(redirectTimerRef.current);
    }
  };

  const runConnectivityTest = async () => {
    setShowConnectivityTest(true);
    try {
      const result = await testConnectivity();
      setConnectivityStatus(result);
    } catch (error) {
      console.error('Connectivity test failed:', error);
      setConnectivityStatus({
        isOnline: false,
        error: 'Failed to run connectivity test',
        timestamp: new Date().toISOString()
      });
    } finally {
      setShowConnectivityTest(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading worksheet...</p>
        </div>
      </div>
    );
  }

  if (error || !worksheet) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-20 h-20 bg-red-100 rounded-full mx-auto mb-4 flex items-center justify-center">
            <svg className="w-12 h-12 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Invalid QR Code</h2>
          <p className="text-gray-600 text-lg mb-6">{error || 'This QR code is invalid. Please check you\'re scanning a Speddy worksheet.'}</p>
          <button
            onClick={() => window.location.href = '/'}
            className="bg-blue-600 text-white py-3 px-6 rounded-lg font-medium text-lg hover:bg-blue-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto">
        {/* Header with worksheet info */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Upload Worksheet</h1>
          
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Student:</span>
              <span className="font-medium">{worksheet.students?.initials || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Grade:</span>
              <span className="font-medium">{worksheet.students?.grade_level || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-medium">{worksheet.worksheet_type || 'Standard'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Created:</span>
              <span className="font-medium">
                {new Date(worksheet.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>

        {/* Success State */}
        {uploadSuccess ? (
          <div className="bg-white rounded-lg shadow-sm p-8 text-center">
            {/* Animated checkmark */}
            <div className="mb-6">
              <div className="w-24 h-24 bg-green-100 rounded-full mx-auto flex items-center justify-center animate-bounce">
                <svg className="w-16 h-16 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Worksheet uploaded successfully!
            </h2>
            
            <p className="text-gray-600 mb-6">
              Redirecting to home in 5 seconds...
            </p>
            
            <button
              onClick={resetUpload}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:bg-blue-700 transition-colors mb-3"
            >
              Upload Another Worksheet
            </button>
            
            <button
              onClick={() => router.push('/')}
              className="w-full bg-gray-200 text-gray-700 py-4 px-6 rounded-lg font-medium text-lg hover:bg-gray-300 transition-colors"
            >
              Go to Home Now
            </button>
          </div>
        ) : !imagePreview ? (
          <div className="bg-white rounded-lg shadow-sm p-6">
            {processingImage && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-sm text-blue-700">Processing image...</p>
              </div>
            )}
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
            
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Capture or Upload</h2>
            
            {/* Camera capture button (primary) */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              className="w-full mb-3 bg-blue-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:bg-blue-700 transition-colors flex items-center justify-center"
            >
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Take Photo
            </button>

            {/* File upload button (secondary) */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full bg-gray-200 text-gray-700 py-4 px-6 rounded-lg font-medium text-lg hover:bg-gray-300 transition-colors flex items-center justify-center"
            >
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Choose from Gallery
            </button>

            {/* Hidden file inputs */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file, 'camera');
              }}
            />
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file, 'gallery');
              }}
            />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Preview</h2>
            
            {/* Image preview */}
            <div className="mb-4 relative">
              <img
                src={imagePreview}
                alt="Worksheet preview"
                className="w-full rounded-lg shadow-sm"
              />
            </div>

            {/* Action buttons */}
            <div className="space-y-3">
              {!uploading && !uploadSuccess && (
                <>
                  <button
                    onClick={handleUpload}
                    className="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:bg-green-700 transition-colors"
                  >
                    Submit Worksheet
                  </button>
                  
                  <button
                    onClick={clearSelection}
                    className="w-full bg-gray-200 text-gray-700 py-4 px-6 rounded-lg font-medium text-lg hover:bg-gray-300 transition-colors"
                  >
                    Retake Photo
                  </button>
                </>
              )}

              {/* Upload progress */}
              {uploading && (
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-lg font-medium text-gray-700 mb-2">{progressMessage}</p>
                    <p className="text-3xl font-bold text-blue-600">{uploadProgress}%</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-4">
                    <div
                      className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {/* Error display */}
              {uploadError && (
                <div className="space-y-4">
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <svg className="w-6 h-6 text-red-600 mr-2 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-red-800 font-medium">Upload Failed</p>
                        <p className="text-red-700 text-sm mt-1">{uploadError.message}</p>
                        
                        {/* Show troubleshooting info for network errors */}
                        {uploadError.showTroubleshooting && uploadError.details && (
                          <details className="mt-3">
                            <summary className="text-red-600 text-sm cursor-pointer hover:text-red-800">
                              Show troubleshooting tips
                            </summary>
                            <div className="mt-2 text-sm text-red-700 whitespace-pre-line">
                              {getErrorMessageWithTips(uploadError.details)}
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Connectivity test for network errors */}
                  {(uploadError.type === 'network' || uploadError.type === 'unknown') && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-800 font-medium">Connection Test</p>
                          <p className="text-blue-700 text-sm">Check if the server is reachable</p>
                        </div>
                        <button
                          onClick={runConnectivityTest}
                          disabled={showConnectivityTest}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {showConnectivityTest ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>
                      
                      {/* Connectivity test results */}
                      {connectivityStatus && (
                        <div className="mt-3 p-3 bg-white rounded border text-sm">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Device Status:</span>
                              <span className={connectivityStatus.isOnline ? 'text-green-600' : 'text-red-600'}>
                                {connectivityStatus.isOnline ? 'Online' : 'Offline'}
                              </span>
                            </div>
                            {connectivityStatus.apiReachable !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">API Server:</span>
                                <span className={connectivityStatus.apiReachable ? 'text-green-600' : 'text-red-600'}>
                                  {connectivityStatus.apiReachable ? 'Reachable' : 'Unreachable'}
                                </span>
                              </div>
                            )}
                            {connectivityStatus.supabaseReachable !== undefined && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Database:</span>
                                <span className={connectivityStatus.supabaseReachable ? 'text-green-600' : 'text-red-600'}>
                                  {connectivityStatus.supabaseReachable ? 'Reachable' : 'Unreachable'}
                                </span>
                              </div>
                            )}
                            {connectivityStatus.latency && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Response Time:</span>
                                <span className="text-gray-800">{connectivityStatus.latency}ms</span>
                              </div>
                            )}
                            {connectivityStatus.networkType && (
                              <div className="flex justify-between">
                                <span className="text-gray-600">Connection:</span>
                                <span className="text-gray-800">{connectivityStatus.networkType}</span>
                              </div>
                            )}
                            {connectivityStatus.error && (
                              <div className="text-red-600 text-xs mt-2">
                                {connectivityStatus.error}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Retry buttons based on error type */}
                  <div className="space-y-3">
                    {uploadError.type === 'network' ? (
                      <>
                        <button
                          onClick={handleUpload}
                          className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:bg-blue-700 transition-colors"
                        >
                          Retry Upload
                        </button>
                        <button
                          onClick={clearSelection}
                          className="w-full bg-gray-200 text-gray-700 py-4 px-6 rounded-lg font-medium text-lg hover:bg-gray-300 transition-colors"
                        >
                          Try Different Photo
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={clearSelection}
                        className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-medium text-lg hover:bg-blue-700 transition-colors"
                      >
                        Try Different Photo
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}