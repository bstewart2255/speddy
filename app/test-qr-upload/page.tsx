'use client';

import { useState } from 'react';
import QRCode from 'qrcode';

/**
 * Test page for QR upload feature
 * Access at: /test-qr-upload
 */
export default function QRUploadTestPage() {
  const [testResults, setTestResults] = useState<any[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [worksheetCode] = useState(() => 
    Math.random().toString(36).substring(2, 10).toUpperCase()
  );

  const addResult = (test: string, status: 'PASS' | 'FAIL' | 'INFO', details?: string) => {
    setTestResults(prev => [...prev, { test, status, details, time: new Date().toISOString() }]);
  };

  const generateQRCode = async (format: 'url' | 'json' | 'string') => {
    try {
      let content: string;
      switch (format) {
        case 'url':
          content = `https://app.speddy.com/ws/${worksheetCode}`;
          break;
        case 'json':
          content = JSON.stringify({ worksheetCode });
          break;
        case 'string':
          content = worksheetCode;
          break;
      }

      const dataUrl = await QRCode.toDataURL(content, {
        width: 300,
        margin: 2
      });
      
      setQrDataUrl(dataUrl);
      addResult(`Generate ${format} QR code`, 'PASS', content);
    } catch (error: any) {
      addResult(`Generate ${format} QR code`, 'FAIL', error.message);
    }
  };

  const testUploadFlow = async () => {
    addResult('Upload flow test', 'INFO', 'Opening upload page in new tab...');
    window.open(`/ws/${worksheetCode}`, '_blank');
  };

  const testRateLimiting = async () => {
    addResult('Rate limiting test', 'INFO', 'Testing rate limits...');
    
    // Simulate multiple uploads
    for (let i = 0; i < 3; i++) {
      try {
        const response = await fetch('/api/submit-worksheet', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
            qr_code: worksheetCode,
            source: 'qr_scan_upload'
          })
        });

        const remaining = response.headers.get('X-RateLimit-Remaining');
        if (response.ok) {
          addResult(`Upload ${i + 1}`, 'PASS', `Remaining: ${remaining}`);
        } else {
          const data = await response.json();
          addResult(`Upload ${i + 1}`, response.status === 429 ? 'PASS' : 'FAIL', 
            `Status: ${response.status}, ${data.error}`);
        }
      } catch (error: any) {
        addResult(`Upload ${i + 1}`, 'FAIL', error.message);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  };


  const clearResults = () => {
    setTestResults([]);
    setQrDataUrl('');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">QR Upload Feature Test Suite</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Test Controls */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Test Controls</h2>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Test Worksheet Code:</p>
                <code className="bg-gray-100 px-3 py-1 rounded text-lg font-mono">{worksheetCode}</code>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">1. QR Code Generation</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => generateQRCode('url')}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    URL Format
                  </button>
                  <button
                    onClick={() => generateQRCode('json')}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    JSON Format
                  </button>
                  <button
                    onClick={() => generateQRCode('string')}
                    className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
                  >
                    String Format
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">2. Feature Tests</h3>
                <div className="space-y-2">
                  <button
                    onClick={testUploadFlow}
                    className="w-full px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700"
                  >
                    Test Upload Flow
                  </button>
                  <button
                    onClick={testRateLimiting}
                    className="w-full px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700"
                  >
                    Test Rate Limiting
                  </button>
                </div>
              </div>

              {qrDataUrl && (
                <div className="mt-6">
                  <h3 className="font-medium mb-2">Generated QR Code:</h3>
                  <img src={qrDataUrl} alt="QR Code" className="border rounded" />
                  <p className="text-sm text-gray-600 mt-2">
                    Scan this with your phone camera to test
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Test Results */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Test Results</h2>
              <button
                onClick={clearResults}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Clear
              </button>
            </div>
            
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {testResults.length === 0 ? (
                <p className="text-gray-500">No tests run yet</p>
              ) : (
                testResults.map((result, index) => (
                  <div key={index} className="border-b pb-2">
                    <div className="flex items-start gap-2">
                      <span className={`text-lg ${
                        result.status === 'PASS' ? 'text-green-600' :
                        result.status === 'FAIL' ? 'text-red-600' :
                        'text-blue-600'
                      }`}>
                        {result.status === 'PASS' ? '✅' :
                         result.status === 'FAIL' ? '❌' : 'ℹ️'}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium">{result.test}</p>
                        {result.details && (
                          <p className="text-sm text-gray-600">{result.details}</p>
                        )}
                        <p className="text-xs text-gray-400">
                          {new Date(result.time).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Testing Checklist */}
        <div className="mt-8 bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Manual Testing Checklist</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium mb-2">Mobile Testing</h3>
              <ul className="space-y-1 text-sm">
                <li>□ iOS Safari - Camera capture</li>
                <li>□ iOS Safari - Gallery upload</li>
                <li>□ Android Chrome - Camera capture</li>
                <li>□ Android Chrome - Gallery upload</li>
                <li>□ Test offline mode handling</li>
                <li>□ Test slow connection (3G)</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-medium mb-2">Feature Testing</h3>
              <ul className="space-y-1 text-sm">
                <li>□ QR code scans correctly</li>
                <li>□ Upload succeeds with valid image</li>
                <li>□ Rate limiting blocks after limits</li>
                <li>□ Error messages are clear</li>
                <li>□ Analytics tracking works</li>
                <li>□ Success redirect works</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-4 bg-yellow-50 rounded">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> For complete testing, use real devices and follow the full checklist in 
              <code className="bg-yellow-100 px-1 rounded mx-1">docs/QR_UPLOAD_TEST_CHECKLIST.md</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}