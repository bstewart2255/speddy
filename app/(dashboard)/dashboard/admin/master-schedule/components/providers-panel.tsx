'use client';

import React, { useMemo } from 'react';
import { SidebarSection } from './sidebar-section';
import type { ProviderOption } from '../../../../../../lib/supabase/queries/staff';
import type { YardDutyAssignment } from '@/src/types/database';

interface ProvidersPanelProps {
  providers: ProviderOption[];
  selectedProviderIds: Set<string>;
  onToggleProvider: (providerId: string) => void;
  yardDutyAssignments?: YardDutyAssignment[];
}

export function ProvidersPanel({
  providers,
  selectedProviderIds,
  onToggleProvider,
  yardDutyAssignments = [],
}: ProvidersPanelProps) {
  const yardDutyMinutesByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const yd of yardDutyAssignments) {
      if (!yd.provider_id) continue;
      const [sh, sm] = yd.start_time.split(':').map(Number);
      const [eh, em] = yd.end_time.split(':').map(Number);
      const minutes = (eh * 60 + em) - (sh * 60 + sm);
      if (minutes > 0) {
        map.set(yd.provider_id, (map.get(yd.provider_id) || 0) + minutes);
      }
    }
    return map;
  }, [yardDutyAssignments]);
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
              <div className="text-sm text-gray-900 truncate flex-1 min-w-0">
                {provider.full_name}
              </div>
              {yardDutyMinutesByProvider.has(provider.id) && (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5 flex-shrink-0">
                  {yardDutyMinutesByProvider.get(provider.id)}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </SidebarSection>
  );
}
