'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/app/components/ui/dialog';
import { Button } from '@/app/components/ui/button';
import { Badge } from '@/app/components/ui/badge';
import { Input } from '@/app/components/ui/input';
import { Textarea } from '@/app/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/app/components/ui/radio-group';
import { Label } from '@/app/components/ui/label';
import { Alert, AlertDescription } from '@/app/components/ui/alert';
import { CheckCircle, XCircle, AlertCircle, School } from 'lucide-react';

interface SchoolMatch {
  school_id: string;
  school_name: string;
  district_id: string;
  district_name: string;
  state_id: string;
  state_name: string;
  confidence_score: number;
  match_reason: string;
}

interface UnmigratedUser {
  id: string;
  email: string;
  display_name: string;
  school_district: string;
  school_site: string;
}

interface MigrationReviewDialogProps {
  open: boolean;
  onClose: () => void;
  user: UnmigratedUser;
  matches: SchoolMatch[];
  onApprove: (
    userId: string,
    schoolId: string,
    districtId: string,
    stateId: string,
    confidence: number,
    notes?: string
  ) => Promise<void>;
}

export function MigrationReviewDialog({
  open,
  onClose,
  user,
  matches,
  onApprove
}: MigrationReviewDialogProps) {
  const [selectedMatch, setSelectedMatch] = useState<string>('');
  const [manualEntry, setManualEntry] = useState(false);
  const [manualSchoolId, setManualSchoolId] = useState('');
  const [manualDistrictId, setManualDistrictId] = useState('');
  const [manualStateId, setManualStateId] = useState('');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleApprove = async () => {
    if (!selectedMatch && !manualEntry) return;

    setProcessing(true);
    try {
      if (manualEntry) {
        await onApprove(
          user.id,
          manualSchoolId,
          manualDistrictId,
          manualStateId,
          0, // Manual entry has 0 confidence score for tracking
          notes || 'Manual entry by admin'
        );
      } else {
        const match = matches.find(m => m.school_id === selectedMatch);
        if (match) {
          await onApprove(
            user.id,
            match.school_id,
            match.district_id,
            match.state_id,
            match.confidence_score,
            notes
          );
        }
      }
      onClose();
    } catch (error) {
      console.error('Error approving migration:', error);
    } finally {
      setProcessing(false);
    }
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.95) {
      return <Badge className="bg-green-500">High ({Math.round(score * 100)}%)</Badge>;
    } else if (score >= 0.8) {
      return <Badge className="bg-yellow-500">Medium ({Math.round(score * 100)}%)</Badge>;
    } else {
      return <Badge className="bg-orange-500">Low ({Math.round(score * 100)}%)</Badge>;
    }
  };

  const getConfidenceIcon = (score: number) => {
    if (score >= 0.95) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else if (score >= 0.8) {
      return <AlertCircle className="h-5 w-5 text-yellow-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-orange-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Review School Migration</DialogTitle>
          <DialogDescription>
            Review and approve the school match for this user
          </DialogDescription>
        </DialogHeader>

        {/* User Information */}
        <div className="bg-gray-50 p-4 rounded-lg mb-4">
          <h3 className="font-semibold mb-2">User Information</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-600">Name:</span> {user.display_name}
            </div>
            <div>
              <span className="text-gray-600">Email:</span> {user.email}
            </div>
            <div>
              <span className="text-gray-600">Current School:</span> {user.school_site}
            </div>
            <div>
              <span className="text-gray-600">Current District:</span> {user.school_district}
            </div>
          </div>
        </div>

        {/* Suggested Matches */}
        {matches.length > 0 ? (
          <div className="space-y-2">
            <h3 className="font-semibold mb-2">Suggested Matches</h3>
            <RadioGroup value={selectedMatch} onValueChange={setSelectedMatch}>
              {matches.map((match) => (
                <div
                  key={match.school_id}
                  className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedMatch === match.school_id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => {
                    setSelectedMatch(match.school_id);
                    setManualEntry(false);
                  }}
                >
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value={match.school_id} />
                    {getConfidenceIcon(match.confidence_score)}
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <School className="h-4 w-4" />
                        <span className="font-medium">{match.school_name}</span>
                        {getConfidenceBadge(match.confidence_score)}
                      </div>
                      <div className="text-sm text-gray-600">
                        <div>{match.district_name}</div>
                        <div>{match.state_name}</div>
                        <div className="mt-1 text-xs italic">{match.match_reason}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </RadioGroup>
          </div>
        ) : (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No automatic matches found. Please use manual entry below.
            </AlertDescription>
          </Alert>
        )}

        {/* Manual Entry Option */}
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              id="manual-entry"
              checked={manualEntry}
              onChange={(e) => {
                setManualEntry(e.target.checked);
                if (e.target.checked) {
                  setSelectedMatch('');
                }
              }}
            />
            <Label htmlFor="manual-entry" className="font-semibold cursor-pointer">
              Manual Entry (No Match Found)
            </Label>
          </div>

          {manualEntry && (
            <div className="space-y-3 pl-6">
              <div>
                <Label htmlFor="manual-school-id">School ID</Label>
                <Input
                  id="manual-school-id"
                  value={manualSchoolId}
                  onChange={(e) => setManualSchoolId(e.target.value)}
                  placeholder="Enter school ID"
                />
              </div>
              <div>
                <Label htmlFor="manual-district-id">District ID</Label>
                <Input
                  id="manual-district-id"
                  value={manualDistrictId}
                  onChange={(e) => setManualDistrictId(e.target.value)}
                  placeholder="Enter district ID"
                />
              </div>
              <div>
                <Label htmlFor="manual-state-id">State ID</Label>
                <Input
                  id="manual-state-id"
                  value={manualStateId}
                  onChange={(e) => setManualStateId(e.target.value)}
                  placeholder="Enter state ID (e.g., CA)"
                  maxLength={2}
                />
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="mt-4">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Add any notes about this migration..."
            rows={3}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose} disabled={processing}>
            Cancel
          </Button>
          <Button
            onClick={handleApprove}
            disabled={
              processing ||
              (!selectedMatch && !manualEntry) ||
              (manualEntry && (!manualSchoolId || !manualDistrictId || !manualStateId))
            }
          >
            {processing ? 'Processing...' : 'Approve Migration'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}