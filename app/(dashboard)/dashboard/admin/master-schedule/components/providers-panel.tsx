'use client';

import React from 'react';
import { SidebarSection } from './sidebar-section';
import type { ProviderOption } from '../../../../../../lib/supabase/queries/staff';

interface ProvidersPanelProps {
  providers: ProviderOption[];
}

export function ProvidersPanel({ providers }: ProvidersPanelProps) {
  return (
    <SidebarSection title="Providers" count={providers.length}>
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {providers.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-4">
            No providers found
          </p>
        ) : (
          providers.map((provider) => (
            <div
              key={provider.id}
              className="flex items-center gap-2 p-2 rounded"
            >
              <div className="text-sm text-gray-900 truncate">
                {provider.full_name}
              </div>
            </div>
          ))
        )}
      </div>
    </SidebarSection>
  );
}
