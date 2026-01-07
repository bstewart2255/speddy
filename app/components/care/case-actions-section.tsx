'use client';

import { useState } from 'react';
import { CareActionItem } from '@/lib/supabase/queries/care-cases';

interface CaseActionsSectionProps {
  actionItems: CareActionItem[];
  onAddItem: (item: { description: string; due_date?: string }) => Promise<void>;
  onToggleComplete: (itemId: string, completed: boolean) => Promise<void>;
  onDeleteItem?: (itemId: string) => Promise<void>;
  readOnly?: boolean;
}

export function CaseActionsSection({
  actionItems,
  onAddItem,
  onToggleComplete,
  onDeleteItem,
  readOnly = false,
}: CaseActionsSectionProps) {
  const [newDescription, setNewDescription] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDescription.trim()) return;

    setLoading(true);
    setError('');

    try {
      await onAddItem({
        description: newDescription.trim(),
        due_date: newDueDate || undefined,
      });
      setNewDescription('');
      setNewDueDate('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add action item');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  };

  const isOverdue = (item: CareActionItem) => {
    if (!item.due_date || item.completed_at) return false;
    return new Date(item.due_date) < new Date();
  };

  // Separate completed and incomplete items
  const incompleteItems = actionItems.filter((item) => !item.completed_at);
  const completedItems = actionItems.filter((item) => item.completed_at);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Action Items</h3>

      {/* Add action item form - hidden in read-only mode */}
      {!readOnly && (
        <form onSubmit={handleSubmit} className="mb-4">
          <div className="flex gap-2">
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Add an action item..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <input
              type="date"
              value={newDueDate}
              onChange={(e) => setNewDueDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !newDescription.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
          {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        </form>
      )}

      {/* Action items list */}
      {actionItems.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">No action items yet</p>
      ) : (
        <div className="space-y-2">
          {/* Incomplete items */}
          {incompleteItems.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-3 p-2 rounded ${
                isOverdue(item) ? 'bg-red-50' : 'bg-gray-50'
              }`}
            >
              {readOnly ? (
                <div className="mt-1 h-4 w-4 border border-gray-300 rounded" />
              ) : (
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => onToggleComplete(item.id, true)}
                  className="mt-1 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-900">{item.description}</p>
                {item.due_date && (
                  <p
                    className={`text-xs ${
                      isOverdue(item) ? 'text-red-600 font-medium' : 'text-gray-500'
                    }`}
                  >
                    Due: {formatDate(item.due_date)}
                    {isOverdue(item) && ' (Overdue)'}
                  </p>
                )}
              </div>
              {!readOnly && onDeleteItem && (
                <button
                  onClick={() => onDeleteItem(item.id)}
                  className="text-xs text-gray-400 hover:text-red-600"
                >
                  Delete
                </button>
              )}
            </div>
          ))}

          {/* Completed items */}
          {completedItems.length > 0 && (
            <>
              <div className="border-t border-gray-200 my-2 pt-2">
                <p className="text-xs text-gray-500 mb-2">Completed ({completedItems.length})</p>
              </div>
              {completedItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 p-2 opacity-60">
                  {readOnly ? (
                    <div className="mt-1 h-4 w-4 flex items-center justify-center">
                      <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  ) : (
                    <input
                      type="checkbox"
                      checked={true}
                      onChange={() => onToggleComplete(item.id, false)}
                      className="mt-1 h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-500 line-through">{item.description}</p>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
