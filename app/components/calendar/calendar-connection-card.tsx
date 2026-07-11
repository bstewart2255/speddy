'use client';

/**
 * Google Calendar connect/disconnect card (SPE-205). Shown on the provider
 * and admin meetings pages. Reads the ?calendar= flag the OAuth routes set
 * (connected | denied | error | not_configured) for one-shot feedback, then
 * strips it from the URL.
 */
import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import {
  getMyCalendarConnection,
  type CalendarConnectionInfo,
} from '@/lib/supabase/queries/calendar-connections';

const BANNERS: Record<string, { style: string; text: string }> = {
  connected: {
    style: 'bg-green-50 border-green-200 text-green-700',
    text: 'Google Calendar connected. The planner now sees your real availability.',
  },
  denied: {
    style: 'bg-amber-50 border-amber-200 text-amber-800',
    text: 'Google connection was cancelled — nothing was changed. You can connect anytime.',
  },
  error: {
    style: 'bg-red-50 border-red-200 text-red-700',
    text: 'Connecting Google Calendar failed. Please try again — if it keeps failing, contact support.',
  },
  not_configured: {
    style: 'bg-gray-50 border-gray-200 text-gray-600',
    text: 'Google Calendar integration is not set up on this server yet.',
  },
};

const ALL_DAY_TIP =
  'Tip: mark all-day absences (PD days, leave) as Busy in Google Calendar — all-day events default to "free" and would otherwise look open to the scheduler.';

export function CalendarConnectionCard({ className }: { className?: string }) {
  const [loading, setLoading] = useState(true);
  const [conn, setConn] = useState<CalendarConnectionInfo | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    try {
      setConn(await getMyCalendarConnection());
    } catch (err) {
      console.error('Failed to load calendar connection:', err);
      setConn(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    // One-shot status flag from the OAuth routes; strip it so refreshes and
    // bookmarks don't replay the banner.
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('calendar');
    if (flag) {
      setBanner(flag);
      params.delete('calendar');
      const qs = params.toString();
      window.history.replaceState(
        {},
        '',
        window.location.pathname + (qs ? `?${qs}` : '')
      );
    }
  }, [load]);

  const connect = () => {
    window.location.href = '/api/calendar/google/connect';
  };

  const handleDisconnect = async () => {
    if (
      !window.confirm(
        'Disconnect Google Calendar? Speddy deletes its stored access and revokes the grant at Google. Meetings already on calendars stay put.'
      )
    )
      return;
    setDisconnecting(true);
    try {
      const res = await fetch('/api/calendar/google/disconnect', {
        method: 'POST',
      });
      if (!res.ok) throw new Error(`disconnect failed (${res.status})`);
      setBanner(null);
      await load();
    } catch (err) {
      console.error('Failed to disconnect calendar:', err);
      setBanner('error');
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) return null;

  const bannerDef = banner ? BANNERS[banner] : null;
  const needsReconnect =
    conn?.status === 'revoked' || conn?.status === 'error';

  return (
    <div className={className}>
      {bannerDef && (
        <div
          className={`border rounded-lg p-4 text-sm mb-4 ${bannerDef.style}`}
        >
          {bannerDef.text}
        </div>
      )}

      {conn?.connected ? (
        <Card padding="sm">
          <div className="flex flex-wrap items-center gap-3 px-2">
            <span
              className="h-2.5 w-2.5 rounded-full bg-green-500 shrink-0"
              aria-hidden
            />
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm font-semibold text-gray-900">
                Google Calendar connected
                {conn.googleEmail ? (
                  <span className="text-gray-400 font-normal">
                    {' '}
                    · {conn.googleEmail}
                  </span>
                ) : null}
              </p>
              <p className="text-xs text-gray-500">{ALL_DAY_TIP}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDisconnect}
              isLoading={disconnecting}
            >
              Disconnect
            </Button>
          </div>
        </Card>
      ) : needsReconnect ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Reconnect Google Calendar
              </h2>
              <p className="text-sm text-amber-800">
                Speddy&apos;s access to{' '}
                {conn?.googleEmail ?? 'your Google Calendar'} has expired or
                been revoked, so the planner can&apos;t see that availability
                right now. Reconnecting takes a few seconds.
              </p>
            </div>
            <Button onClick={connect}>Reconnect</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-xl">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Connect Google Calendar
              </h2>
              <p className="text-sm text-gray-600 mb-1">
                One-time setup: the planner reads your real availability, and
                confirmed meetings arrive as ordinary Google Calendar invites.
                Speddy asks for the minimum access — availability (free/busy)
                and events on your own calendar — and you can disconnect at
                any time.
              </p>
              <p className="text-xs text-gray-500">{ALL_DAY_TIP}</p>
            </div>
            <Button onClick={connect}>Connect Google Calendar</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
