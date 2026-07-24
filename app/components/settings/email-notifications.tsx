'use client';

import { Card, CardHeader, CardTitle, CardBody } from '../ui/card';
import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  resourceSchoolKeys,
  seaSharesResourceSchool,
} from '@/lib/settings/sea-daily-email';

interface Sea {
  id: string;
  full_name: string;
  school_site: string | null;
  school_district: string | null;
  daily_schedule_email_enabled: boolean;
}

function Toggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
        checked ? 'bg-blue-600' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function EmailNotificationsSettings() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<string>('');
  const [selfEnabled, setSelfEnabled] = useState(false);
  const [selfSaving, setSelfSaving] = useState(false);
  const [seas, setSeas] = useState<Sea[]>([]);
  const [seaSaving, setSeaSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'id, role, daily_schedule_email_enabled, school_site, school_district, works_at_multiple_schools'
        )
        .eq('id', user.id)
        .single();
      if (!profile) return;

      setRole(profile.role);
      setSelfEnabled(!!profile.daily_schedule_email_enabled);

      if (profile.role === 'resource') {
        let providerSchools: Array<{
          school_site: string | null;
          school_district: string | null;
        }> = [];
        if (profile.works_at_multiple_schools) {
          const { data: ps } = await supabase
            .from('provider_schools')
            .select('school_site, school_district')
            .eq('provider_id', user.id);
          providerSchools = ps ?? [];
        }

        const keys = resourceSchoolKeys({
          worksAtMultipleSchools: profile.works_at_multiple_schools,
          schoolSite: profile.school_site,
          schoolDistrict: profile.school_district,
          providerSchools,
        });

        // RLS already scopes visible profiles to the caller's schools; the
        // site+district filter is the same rule the API authorizes against.
        const { data: seaRows } = await supabase
          .from('profiles')
          .select(
            'id, full_name, school_site, school_district, daily_schedule_email_enabled'
          )
          .eq('role', 'sea');

        const shared = (seaRows ?? [])
          .filter((s) => seaSharesResourceSchool(s, keys))
          .map((s) => ({
            id: s.id,
            full_name: s.full_name,
            school_site: s.school_site,
            school_district: s.school_district,
            daily_schedule_email_enabled: !!s.daily_schedule_email_enabled,
          }))
          .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
        setSeas(shared);
      }
    } catch (e) {
      console.error('Error loading email notification settings:', e);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleSelf = async () => {
    const next = !selfEnabled;
    setError(null);
    setSelfSaving(true);
    setSelfEnabled(next); // optimistic
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('no user');
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ daily_schedule_email_enabled: next })
        .eq('id', user.id);
      if (updErr) throw updErr;
    } catch (e) {
      setSelfEnabled(!next); // revert
      setError('Could not update your setting. Please try again.');
    } finally {
      setSelfSaving(false);
    }
  };

  const toggleSea = async (sea: Sea) => {
    const next = !sea.daily_schedule_email_enabled;
    setError(null);
    setSeaSaving((m) => ({ ...m, [sea.id]: true }));
    setSeas((list) =>
      list.map((s) =>
        s.id === sea.id ? { ...s, daily_schedule_email_enabled: next } : s
      )
    ); // optimistic
    try {
      const res = await fetch('/api/settings/sea-daily-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seaId: sea.id, enabled: next }),
      });
      if (!res.ok) throw new Error('request failed');
      const data = await res.json();
      setSeas((list) =>
        list.map((s) =>
          s.id === sea.id
            ? { ...s, daily_schedule_email_enabled: !!data.enabled }
            : s
        )
      );
    } catch (e) {
      setSeas((list) =>
        list.map((s) =>
          s.id === sea.id
            ? { ...s, daily_schedule_email_enabled: sea.daily_schedule_email_enabled }
            : s
        )
      ); // revert
      setError(`Could not update ${sea.full_name}'s setting. Please try again.`);
    } finally {
      setSeaSaving((m) => ({ ...m, [sea.id]: false }));
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-gray-500">Loading…</p>
        </CardBody>
      </Card>
    );
  }

  // Group SEAs by school for a multi-school RS (show headers only when >1 site).
  const seaGroups = new Map<string, Sea[]>();
  for (const sea of seas) {
    const key = sea.school_site || 'Unknown school';
    if (!seaGroups.has(key)) seaGroups.set(key, []);
    seaGroups.get(key)!.push(sea);
  }
  const showSchoolHeaders = seaGroups.size > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email notifications</CardTitle>
      </CardHeader>
      <CardBody>
        <div className="space-y-6">
          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Section 1: own daily schedule email */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">
                Email me my daily schedule
              </p>
              <p className="mt-1 text-sm text-gray-500">
                Get your schedule delivered to your inbox each weekday morning.
                Days with no sessions are skipped.
              </p>
            </div>
            <Toggle
              checked={selfEnabled}
              disabled={selfSaving}
              onChange={toggleSelf}
              label="Email me my daily schedule"
            />
          </div>

          {/* Section 2: RS toggles for their SEAs (resource only, when any) */}
          {role === 'resource' && seas.length > 0 && (
            <div className="border-t border-gray-200 pt-6">
              <p className="text-sm font-medium text-gray-900">
                Daily schedule emails for your SEAs
              </p>
              <p className="mt-1 mb-3 text-sm text-gray-500">
                Turn daily schedule emails on or off for the SEAs at your school.
                This updates their own setting.
              </p>
              <div className="space-y-4">
                {Array.from(seaGroups.entries()).map(([site, group]) => (
                  <div key={site}>
                    {showSchoolHeaders && (
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                        {site}
                      </h4>
                    )}
                    <div className="space-y-2">
                      {group.map((sea) => (
                        <div
                          key={sea.id}
                          className="flex items-center justify-between gap-4"
                        >
                          <span className="text-sm text-gray-900">
                            {sea.full_name}
                          </span>
                          <Toggle
                            checked={sea.daily_schedule_email_enabled}
                            disabled={!!seaSaving[sea.id]}
                            onChange={() => toggleSea(sea)}
                            label={`Daily schedule email for ${sea.full_name}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
