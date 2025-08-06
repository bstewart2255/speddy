'use client';

import { useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Button } from '@/app/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/app/components/ui/card';
import { Progress } from '@/app/components/ui/progress';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { Badge } from '@/app/components/ui/badge';
import { Slider } from '@/app/components/ui/slider';
import { Label } from '@/app/components/ui/label';
import { PlayCircle, PauseCircle, CheckCircle, XCircle, AlertCircle, Download } from 'lucide-react';
import { batchFuzzyMatch } from './fuzzy-matcher';

interface UnmigratedUser {
  id: string;
  email: string;
  display_name: string;
  school_district: string;
  school_site: string;
}

interface BatchProcessingPanelProps {
  unmigratedUsers: UnmigratedUser[];
  onProcessComplete: () => void;
}

interface ProcessingResult {
  userId: string;
  userEmail: string;
  status: 'success' | 'failed' | 'skipped';
  message: string;
  confidence?: number;
  schoolId?: string;
}

export function BatchProcessingPanel({
  unmigratedUsers,
  onProcessComplete
}: BatchProcessingPanelProps) {
  const supabase = createClientComponentClient();
  const [processing, setProcessing] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.95);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [summary, setSummary] = useState({
    total: 0,
    processed: 0,
    success: 0,
    failed: 0,
    skipped: 0
  });

  const startBatchProcessing = async () => {
    setProcessing(true);
    setPaused(false);
    setProgress(0);
    setResults([]);
    setSummary({
      total: unmigratedUsers.length,
      processed: 0,
      success: 0,
      failed: 0,
      skipped: 0
    });

    const batchSize = 10;
    const batches = Math.ceil(unmigratedUsers.length / batchSize);
    setTotalBatches(batches);

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const processResults: ProcessingResult[] = [];

    for (let i = 0; i < unmigratedUsers.length; i += batchSize) {
      if (paused) {
        break;
      }

      setCurrentBatch(Math.floor(i / batchSize) + 1);
      const batch = unmigratedUsers.slice(i, i + batchSize);

      // Get matches for this batch
      const matches = await batchFuzzyMatch(supabase, batch, confidenceThreshold);

      // Process each user in the batch
      for (const user of batch) {
        if (paused) break;

        const userMatches = matches.get(user.id) || [];
        
        if (userMatches.length > 0) {
          const bestMatch = userMatches[0];
          
          try {
            // Update user profile
            const { error: updateError } = await supabase
              .from('profiles')
              .update({
                school_id: bestMatch.school_id,
                district_id: bestMatch.district_id,
                state_id: bestMatch.state_id,
                school_district_original: user.school_district,
                school_site_original: user.school_site
              })
              .eq('id', user.id);

            if (updateError) throw updateError;

            // Log the migration
            const { error: logError } = await supabase
              .from('school_migration_log')
              .insert({
                profile_id: user.id,
                original_district: user.school_district,
                original_school: user.school_site,
                matched_school_id: bestMatch.school_id,
                matched_district_id: bestMatch.district_id,
                matched_state_id: bestMatch.state_id,
                confidence_score: bestMatch.confidence_score,
                migration_type: 'auto',
                migrated_by: currentUser?.id,
                notes: `Batch processed with confidence threshold ${confidenceThreshold}`
              });

            if (logError) throw logError;

            processResults.push({
              userId: user.id,
              userEmail: user.email,
              status: 'success',
              message: `Matched to ${bestMatch.school_name}`,
              confidence: bestMatch.confidence_score,
              schoolId: bestMatch.school_id
            });

            setSummary(prev => ({
              ...prev,
              processed: prev.processed + 1,
              success: prev.success + 1
            }));
          } catch (error) {
            processResults.push({
              userId: user.id,
              userEmail: user.email,
              status: 'failed',
              message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            });

            setSummary(prev => ({
              ...prev,
              processed: prev.processed + 1,
              failed: prev.failed + 1
            }));
          }
        } else {
          processResults.push({
            userId: user.id,
            userEmail: user.email,
            status: 'skipped',
            message: `No match found above ${Math.round(confidenceThreshold * 100)}% confidence`
          });

          setSummary(prev => ({
            ...prev,
            processed: prev.processed + 1,
            skipped: prev.skipped + 1
          }));
        }

        setResults([...processResults]);
        setProgress((processResults.length / unmigratedUsers.length) * 100);
      }
    }

    setProcessing(false);
    onProcessComplete();
  };

  const pauseProcessing = () => {
    setPaused(true);
  };

  const resumeProcessing = () => {
    setPaused(false);
    // Continue processing would need to be implemented
  };

  const exportResults = () => {
    const csv = [
      ['User ID', 'Email', 'Status', 'Message', 'Confidence', 'School ID'],
      ...results.map(r => [
        r.userId,
        r.userEmail,
        r.status,
        r.message,
        r.confidence ? Math.round(r.confidence * 100) + '%' : '',
        r.schoolId || ''
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-migration-results-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Configuration Card */}
      <Card>
        <CardHeader>
          <CardTitle>Batch Processing Configuration</CardTitle>
          <CardDescription>
            Automatically migrate users with high-confidence matches
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="confidence-threshold">
              Confidence Threshold: {Math.round(confidenceThreshold * 100)}%
            </Label>
            <Slider
              id="confidence-threshold"
              min={60}
              max={100}
              step={5}
              value={[confidenceThreshold * 100]}
              onValueChange={(value) => setConfidenceThreshold(value[0] / 100)}
              className="mt-2"
              disabled={processing}
            />
            <p className="text-sm text-gray-500 mt-1">
              Only users with matches above this threshold will be automatically migrated
            </p>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> This will automatically migrate {unmigratedUsers.length} users. 
              High confidence threshold (95%+) is recommended for automatic processing.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            {!processing ? (
              <Button onClick={startBatchProcessing} disabled={unmigratedUsers.length === 0}>
                <PlayCircle className="h-4 w-4 mr-2" />
                Start Batch Processing
              </Button>
            ) : (
              <>
                {!paused ? (
                  <Button onClick={pauseProcessing} variant="outline">
                    <PauseCircle className="h-4 w-4 mr-2" />
                    Pause
                  </Button>
                ) : (
                  <Button onClick={resumeProcessing}>
                    <PlayCircle className="h-4 w-4 mr-2" />
                    Resume
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Progress Card */}
      {(processing || results.length > 0) && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Progress</CardTitle>
            {processing && (
              <CardDescription>
                Batch {currentBatch} of {totalBatches}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>Progress</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Total</div>
                <div className="text-2xl font-bold">{summary.total}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Success</div>
                <div className="text-2xl font-bold text-green-600">{summary.success}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Skipped</div>
                <div className="text-2xl font-bold text-yellow-600">{summary.skipped}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Failed</div>
                <div className="text-2xl font-bold text-red-600">{summary.failed}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results Card */}
      {results.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Processing Results</CardTitle>
            <Button onClick={exportResults} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="text-left py-2">Status</th>
                    <th className="text-left py-2">User</th>
                    <th className="text-left py-2">Result</th>
                    <th className="text-left py-2">Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="py-2">
                        {result.status === 'success' && (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        )}
                        {result.status === 'skipped' && (
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                        )}
                        {result.status === 'failed' && (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="py-2">
                        <div className="truncate max-w-xs" title={result.userEmail}>
                          {result.userEmail}
                        </div>
                      </td>
                      <td className="py-2">
                        <div className="truncate max-w-xs" title={result.message}>
                          {result.message}
                        </div>
                      </td>
                      <td className="py-2">
                        {result.confidence && (
                          <Badge variant={
                            result.confidence >= 0.95 ? 'success' :
                            result.confidence >= 0.8 ? 'warning' : 'secondary'
                          }>
                            {Math.round(result.confidence * 100)}%
                          </Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}