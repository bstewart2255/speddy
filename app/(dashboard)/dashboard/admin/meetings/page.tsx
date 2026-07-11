'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { CalendarConnectionCard } from '@/app/components/calendar/calendar-connection-card';
import { getCurrentAdminPermissions } from '@/lib/supabase/queries/admin-accounts';
import {
  getSiteMeetingRules,
  upsertSiteMeetingRules,
  type MeetingWindow,
  type BlackoutRange,
} from '@/lib/supabase/queries/iep-meeting-setup';

const DAY_NAMES: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
};

export default function AdminMeetingsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [isDistrictAdmin, setIsDistrictAdmin] = useState(false);

  const [windows, setWindows] = useState<MeetingWindow[]>([]);
  const [blackouts, setBlackouts] = useState<BlackoutRange[]>([]);
  const [roomsText, setRoomsText] = useState('');
  const [maxPerDay, setMaxPerDay] = useState<string>('');
  const [calendarId, setCalendarId] = useState('');

  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const permissions = await getCurrentAdminPermissions();
        const siteAdminPerm = permissions?.find(p => p.role === 'site_admin');
        if (!siteAdminPerm?.school_id) {
          const districtPerm = permissions?.find(p => p.role === 'district_admin');
          if (districtPerm) {
            setIsDistrictAdmin(true);
            setLoading(false);
            return;
          }
          setError('Site admin access required');
          setLoading(false);
          return;
        }
        setSchoolId(siteAdminPerm.school_id);

        const rules = await getSiteMeetingRules(siteAdminPerm.school_id);
        if (rules) {
          setWindows((rules.allowed_windows as unknown as MeetingWindow[]) ?? []);
          setBlackouts((rules.blackout_ranges as unknown as BlackoutRange[]) ?? []);
          setRoomsText((rules.rooms ?? []).join(', '));
          setMaxPerDay(rules.max_meetings_per_day?.toString() ?? '');
          setCalendarId(rules.external_iep_calendar_id ?? '');
        }
      } catch (err) {
        console.error('Failed to load meeting settings:', err);
        setError('Failed to load meeting settings');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    if (!schoolId) return;
    const invalidWindow = windows.some(
      w => !w.start_time || !w.end_time || w.start_time >= w.end_time
    );
    const invalidBlackout = blackouts.some(
      b => !b.start_date || !b.end_date || b.start_date > b.end_date
    );
    if (invalidWindow || invalidBlackout) {
      setError(
        'Each meeting window needs a start time before its end time, and each blackout needs a valid date range.'
      );
      return;
    }
    const parsedMaxPerDay = maxPerDay ? parseInt(maxPerDay, 10) : NaN;
    setSaving(true);
    setError(null);
    try {
      const rooms = roomsText
        .split(',')
        .map(r => r.trim())
        .filter(Boolean);
      await upsertSiteMeetingRules(schoolId, {
        allowed_windows: windows,
        blackout_ranges: blackouts,
        rooms: rooms.length ? rooms : null,
        max_meetings_per_day: parsedMaxPerDay > 0 ? parsedMaxPerDay : null,
        external_iep_calendar_id: calendarId.trim() || null,
      });
      setSavedAt(new Date());
    } catch (err) {
      console.error('Failed to save meeting settings:', err);
      setError('Failed to save meeting settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      </div>
    );
  }

  if (isDistrictAdmin) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Meetings</h1>
        <Card>
          <p className="text-gray-600">
            IEP meeting settings are configured per school by each site admin.
            District-wide views will appear here as scheduling features roll
            out.
          </p>
        </Card>
      </div>
    );
  }

  if (error && !schoolId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Meetings</h1>
        <div className="flex items-center gap-3">
          {savedAt && !saving && (
            <span className="text-sm text-green-600">Settings saved</span>
          )}
          <Button onClick={handleSave} isLoading={saving}>
            Save settings
          </Button>
        </div>
      </div>
      <p className="text-gray-500 mb-6">
        Site rules for scheduling IEP meetings. The planner only proposes
        times inside these windows and never double-books the site.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 mb-6">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <CalendarConnectionCard />

        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Meeting windows
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            When can IEP meetings be held at this school?
          </p>
          <div className="space-y-2">
            {windows.map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <select
                  value={w.day_of_week}
                  onChange={e =>
                    setWindows(ws =>
                      ws.map((x, j) =>
                        j === i
                          ? { ...x, day_of_week: parseInt(e.target.value, 10) }
                          : x
                      )
                    )
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Day of week"
                >
                  {Object.entries(DAY_NAMES).map(([num, name]) => (
                    <option key={num} value={num}>
                      {name}
                    </option>
                  ))}
                </select>
                <input
                  type="time"
                  value={w.start_time}
                  onChange={e =>
                    setWindows(ws =>
                      ws.map((x, j) =>
                        j === i ? { ...x, start_time: e.target.value } : x
                      )
                    )
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Window start time"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="time"
                  value={w.end_time}
                  onChange={e =>
                    setWindows(ws =>
                      ws.map((x, j) =>
                        j === i ? { ...x, end_time: e.target.value } : x
                      )
                    )
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Window end time"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWindows(ws => ws.filter((_, j) => j !== i))}
                  aria-label={`Remove window ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() =>
              setWindows(ws => [
                ...ws,
                { day_of_week: 2, start_time: '07:30', end_time: '08:15' },
              ])
            }
          >
            + Add window
          </Button>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Blackout dates
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Date ranges when no IEP meetings should be scheduled (testing
            windows, breaks).
          </p>
          <div className="space-y-2">
            {blackouts.map((b, i) => (
              <div key={i} className="flex items-center gap-3">
                <input
                  type="date"
                  value={b.start_date}
                  onChange={e =>
                    setBlackouts(bs =>
                      bs.map((x, j) =>
                        j === i ? { ...x, start_date: e.target.value } : x
                      )
                    )
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Blackout start date"
                />
                <span className="text-gray-400">to</span>
                <input
                  type="date"
                  value={b.end_date}
                  onChange={e =>
                    setBlackouts(bs =>
                      bs.map((x, j) =>
                        j === i ? { ...x, end_date: e.target.value } : x
                      )
                    )
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                  aria-label="Blackout end date"
                />
                <input
                  type="text"
                  placeholder="Label (e.g. State testing)"
                  value={b.label}
                  onChange={e =>
                    setBlackouts(bs =>
                      bs.map((x, j) =>
                        j === i ? { ...x, label: e.target.value } : x
                      )
                    )
                  }
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm flex-1"
                  aria-label="Blackout label"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setBlackouts(bs => bs.filter((_, j) => j !== i))
                  }
                  aria-label={`Remove blackout ${i + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() =>
              setBlackouts(bs => [
                ...bs,
                { start_date: '', end_date: '', label: '' },
              ])
            }
          >
            + Add blackout
          </Button>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Capacity & calendar
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label
                htmlFor="rooms"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Meeting rooms
              </label>
              <input
                id="rooms"
                type="text"
                placeholder="Conference room, Library office"
                value={roomsText}
                onChange={e => setRoomsText(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                Comma-separated. Leave blank if rooms aren&apos;t a constraint.
              </p>
            </div>
            <div>
              <label
                htmlFor="maxPerDay"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Max meetings per day
              </label>
              <input
                id="maxPerDay"
                type="number"
                min="1"
                placeholder="No limit"
                value={maxPerDay}
                onChange={e => setMaxPerDay(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div className="md:col-span-2">
              <label
                htmlFor="calendarId"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Existing IEP calendar (optional)
              </label>
              <input
                id="calendarId"
                type="text"
                placeholder="Google Calendar ID, e.g. abc123@group.calendar.google.com"
                value={calendarId}
                onChange={e => setCalendarId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1">
                If your school already keeps a shared IEP calendar, Speddy will
                treat its events as busy time once calendar integration is
                connected.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
