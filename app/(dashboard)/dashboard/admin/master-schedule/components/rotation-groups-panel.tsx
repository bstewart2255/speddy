'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import type { RotationPairWithGroups } from '../../../../../../lib/supabase/queries/rotation-groups';

interface RotationGroupsPanelProps {
  rotationPairs: RotationPairWithGroups[];
  onCreateGroups: () => void;
  onEditPair: (pair: RotationPairWithGroups) => void;
  loading?: boolean;
}

export function RotationGroupsPanel({
  rotationPairs,
  onCreateGroups,
  onEditPair,
  loading = false,
}: RotationGroupsPanelProps) {
  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Rotation Groups</CardTitle>
      </CardHeader>
      <CardBody className="pt-0">
        {/* Create Groups Button */}
        <Button
          variant="secondary"
          size="sm"
          onClick={onCreateGroups}
          className="w-full mb-3 text-sm"
          disabled={loading}
        >
          + Create Groups
        </Button>

        {/* Help text */}
        <p className="text-xs text-gray-500 mb-3">
          {rotationPairs.length === 0
            ? 'Create teacher groups that rotate between activities weekly.'
            : `${rotationPairs.length} rotation${rotationPairs.length !== 1 ? 's' : ''} configured`}
        </p>

        {/* Rotation Pairs List */}
        {loading ? (
          <div className="py-4 text-center text-gray-500 text-sm">Loading...</div>
        ) : rotationPairs.length > 0 ? (
          <div className="space-y-2">
            {rotationPairs.map((pair) => (
              <button
                key={pair.id}
                onClick={() => onEditPair(pair)}
                className="w-full text-left p-3 rounded-lg border border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-colors"
              >
                <div className="flex items-center gap-2">
                  {/* Split color indicator */}
                  <div className="flex-shrink-0 w-4 h-4 rounded overflow-hidden flex">
                    <div
                      className="w-1/2 h-full"
                      style={{ backgroundColor: getActivityColor(pair.activity_type_a) }}
                    />
                    <div
                      className="w-1/2 h-full"
                      style={{ backgroundColor: getActivityColor(pair.activity_type_b) }}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {pair.activity_type_a} / {pair.activity_type_b}
                    </div>
                    <div className="text-xs text-gray-500">
                      {getTotalMemberCount(pair)} teacher{getTotalMemberCount(pair) !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <svg
                    className="w-4 h-4 text-gray-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

// Activity type color map (matching existing pattern)
function getActivityColor(activityType: string): string {
  const colorMap: Record<string, string> = {
    'Library': '#8B5CF6',
    'STEAM': '#F59E0B',
    'STEM': '#F59E0B',
    'Garden': '#10B981',
    'Music': '#EC4899',
    'ART': '#EF4444',
    'PE': '#3B82F6',
  };
  return colorMap[activityType] || '#6B7280';
}

function getTotalMemberCount(pair: RotationPairWithGroups): number {
  return pair.groups.reduce((sum, group) => sum + group.members.length, 0);
}
