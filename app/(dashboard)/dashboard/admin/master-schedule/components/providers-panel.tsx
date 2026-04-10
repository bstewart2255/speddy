'use client';

import React from 'react';
import { SidebarSection } from './sidebar-section';
import type { ProviderOption } from '../../../../../../lib/supabase/queries/staff';

interface ProvidersPanelProps {
  providers: ProviderOption[];
  selectedProviderIds: Set<string>;
  onToggleProvider: (providerId: string) => void;
}

export function ProvidersPanel({
  providers,
  selectedProviderIds,
  onToggleProvider,
}: ProvidersPanelProps) {
  return (
    <SidebarSection title="Providers" count={providers.length}>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {providers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-2">
            No providers found
          </p>
        ) : (
          providers.map((provider) => (
            <label
              key={provider.id}
              className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedProviderIds.has(provider.id)}
                onChange={() => onToggleProvider(provider.id)}
                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                aria-label={provider.full_name}
              />
              <div className="text-sm text-gray-900 truncate">
                {provider.full_name}
              </div>
            </label>
          ))
        )}
      </div>
    </SidebarSection>
  );
}
