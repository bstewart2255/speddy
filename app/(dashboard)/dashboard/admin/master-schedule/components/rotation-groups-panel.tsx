'use client';

import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../../../../../components/ui/card';
import { Button } from '../../../../../components/ui/button';
import { TrashIcon } from '@heroicons/react/24/outline';
import { deleteRotationPair, type RotationPairWithGroups } from '../../../../../../lib/supabase/queries/rotation-groups';

interface RotationGroupsPanelProps {
  rotationPairs: RotationPairWithGroups[];
  onCreateGroups: () => void;
  onEditPair: (pair: RotationPairWithGroups) => void;
  onRefresh: () => void;
  loading?: boolean;
}

export function RotationGroupsPanel({
  rotationPairs,
  onCreateGroups,
  onEditPair,
  onRefresh,
  loading = false,
}: RotationGroupsPanelProps) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const handleDelete = async (e: React.MouseEvent, pair: RotationPairWithGroups) => {
    e.stopPropagation(); // Prevent triggering edit

    const memberCount = getTotalMemberCount(pair);
    const confirmed = window.confirm(
      `Delete "${pair.activity_type_a} / ${pair.activity_type_b}" rotation?\n\n` +
      `This will remove all ${memberCount} teacher${memberCount !== 1 ? 's' : ''} from this rotation.`
    );

    if (!confirmed) return;

    setDeleting(pair.id);
    try {
      await deleteRotationPair(pair.id);
      onRefresh();
    } catch (err) {
      console.error('Error deleting rotation pair:', err);
      alert('Failed to delete rotation. Please try again.');
    } finally {
      setDeleting(null);
    }
  };

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
              <div
                key={pair.id}
                className="group relative rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
              >
                <button
                  onClick={() => onEditPair(pair)}
                  className="w-full text-left p-3 hover:bg-blue-50 rounded-lg transition-colors"
                  disabled={deleting === pair.id}
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
                    {deleting === pair.id ? (
                      <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
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
                    )}
                  </div>
                </button>
                {/* Delete button - visible on hover */}
                <button
                  onClick={(e) => handleDelete(e, pair)}
                  disabled={deleting === pair.id}
                  className="absolute top-1/2 right-8 -translate-y-1/2 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                  title="Delete rotation"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </div>
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
