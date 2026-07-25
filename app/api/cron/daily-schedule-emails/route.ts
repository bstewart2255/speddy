import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServiceClient } from '@/lib/supabase/server';
import { SessionGenerator } from '@/lib/services/session-generator';
import { getResend } from '@/lib/email/resend';
import {
  renderDailyScheduleEmail,
  type DailyScheduleSessionInput,
} from '@/lib/email/daily-schedule';

// SPE-320: daily schedule emails. Weekday mornings (Vercel cron `0 14 * * 1-5`
// UTC → 7am PDT / 6am PST) every opted-in provider/SEA gets their day's schedule
// by email. Zero-session days are skipped. Recipient selection and rendering
// use the SAME read path as the calendar (SessionGenerator), so the email
// matches what the app shows.

const FROM = 'Speddy <schedule@speddy.xyz>';

// SPE-329 scale hardening. v1 ran strictly one recipient at a time, with a
// students query per recipient — fine for a handful of opt-ins, but the whole
// run is serial network latency, so the function's time budget becomes the cap
// on how many people can subscribe.
//
// How many recipients are worked on at once. Deliberately modest: the point is
// to stop the run being a single serial queue, not to hammer Supabase or
// Resend's rate limit (which counts as a failure per recipient, not a retry).
const CONCURRENCY = 5;

// Wall-clock ceiling for one unit of per-recipient work (session generation, or
// render + send). Without it a single hung request holds its slot forever and
// takes the whole batch down with it when the function is killed at the time
// limit — everyone after it silently gets no email.
const PER_RECIPIENT_TIMEOUT_MS = 20_000;

// Students are fetched for every recipient in one pass, so the id list is
// unbounded. Chunked to keep the PostgREST `in.(...)` filter out of URL-length
// territory — batching all recipients into a single query would otherwise trade
// the N+1 for a request that fails outright once enough people opt in.
const STUDENT_LOOKUP_CHUNK = 200;

/**
 * Run `work` over `items` in fixed-size chunks, awaiting each chunk before
 * starting the next. `allSettled` because the callers below already record
 * their own failures — a rejection here must never abort the remaining chunks.
 */
async function inChunks<T>(
  items: T[],
  size: number,
  work: (item: T) => Promise<void>
): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await Promise.allSettled(items.slice(i, i + size).map(work));
  }
}

/**
 * Reject if `work` hasn't settled within `ms`.
 *
 * This bounds wall-clock, it does not cancel: SessionGenerator builds its own
 * Supabase queries internally so there's no signal to thread down to them, and
 * the Resend SDK takes none either. The orphaned request is left to settle into
 * the void — what matters is that it stops occupying a concurrency slot. Race
 * attaches a handler to `work`, so a late rejection is not an unhandled one.
 */
function withTimeout<T>(label: string, ms: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([work, expiry]).finally(() => clearTimeout(timer));
}

// Roles that can opt in (SPECIALIST_SOURCE_ROLES + sea). Matches the Settings
// page's Email notifications card.
const EMAIL_ROLES = [
  'resource',
  'speech',
  'ot',
  'counseling',
  'specialist',
  'psychologist',
  'intervention',
  'sea',
] as const;

/** Today's date in America/Los_Angeles, as a noon-local Date + `yyyy-MM-dd`. */
function losAngelesToday(): { date: Date; str: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  const y = Number(get('year'));
  const m = Number(get('month'));
  const d = Number(get('day'));
  // Noon-local so formatDateLocal()/getDay() inside SessionGenerator resolve to
  // this calendar day regardless of the runtime timezone (Vercel runs in UTC).
  return { date: new Date(y, m - 1, d, 12, 0, 0), str: `${get('year')}-${get('month')}-${get('day')}` };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Header-only secret (never the query string, which leaks into logs).
    // Accept `x-cron-secret` or the standard `Authorization: Bearer <secret>`.
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.toLowerCase().startsWith('bearer ')
      ? authHeader.slice(7).trim()
      : null;
    const token = request.headers.get('x-cron-secret') || bearerToken;

    const expectedToken = process.env.CRON_SECRET;
    if (!expectedToken) {
      console.error('CRON_SECRET environment variable not set');
      return NextResponse.json(
        { success: false, error: 'Server configuration error', timestamp: new Date().toISOString() },
        { status: 500 }
      );
    }
    if (!token || token !== expectedToken) {
      console.warn('Unauthorized daily-schedule-emails attempt');
      return NextResponse.json(
        { success: false, error: 'Unauthorized', timestamp: new Date().toISOString() },
        { status: 401 }
      );
    }

    // Unauthenticated cron request → no user session; use the service client.
    const supabase = createServiceClient();

    const { date, str: todayStr } = losAngelesToday();
    const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.speddy.xyz').replace(/\/+$/, '');
    const settingsUrl = `${baseUrl}/dashboard/settings`;

    const { data: recipients, error: recipientsError } = await supabase
      .from('profiles')
      .select('id, email, role, works_at_multiple_schools')
      .eq('daily_schedule_email_enabled', true)
      .in('role', EMAIL_ROLES as unknown as string[]);

    if (recipientsError) {
      console.error('Error loading daily-schedule recipients:', recipientsError);
      return NextResponse.json(
        {
          success: false,
          error: 'Database error loading recipients',
          details: recipientsError.message,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      );
    }

    const generator = new SessionGenerator(supabase);
    let sent = 0;
    let skipped = 0;
    let failed = 0;

    /** One recipient's failure must never stop the run — count it and move on. */
    const recordFailure = (recipientId: string, cause: unknown) => {
      failed++;
      console.error(`Failed to send daily schedule to ${recipientId}:`, cause);
      Sentry.captureException(cause, {
        tags: { cron: 'daily-schedule-emails' },
        extra: { userId: recipientId, date: todayStr },
      });
    };

    type Recipient = NonNullable<typeof recipients>[number];
    type Prepared = { recipient: Recipient; relevant: Awaited<
      ReturnType<SessionGenerator['getSessionsForDateRange']>
    > };

    // --- Phase 1: resolve each recipient's sessions (concurrent) -------------
    const prepared: Prepared[] = [];

    await inChunks(recipients ?? [], CONCURRENCY, async (recipient) => {
      try {
        const daySessions = await withTimeout(
          `session generation for ${recipient.id}`,
          PER_RECIPIENT_TIMEOUT_MS,
          generator.getSessionsForDateRange(recipient.id, date, date, recipient.role)
        );

        // "My sessions" — only what this user actually delivers, mirroring the
        // calendar's my-sessions view (app/components/calendar/calendar-week-view.tsx):
        // own sessions NOT delegated out, plus sessions delegated TO this user.
        // So a provider's email excludes sessions they handed to a SEA/specialist
        // (the assignee gets those in their own email), and an SEA gets exactly
        // the sessions assigned to them.
        const relevant = daySessions.filter(
          (s) =>
            (s.provider_id === recipient.id &&
              !s.assigned_to_specialist_id &&
              !s.assigned_to_sea_id) ||
            s.assigned_to_specialist_id === recipient.id ||
            s.assigned_to_sea_id === recipient.id
        );

        // No email on zero-session days, or with nowhere to send it.
        if (relevant.length === 0 || !recipient.email) {
          skipped++;
          return;
        }

        prepared.push({ recipient, relevant });
      } catch (recipientError) {
        recordFailure(recipient.id, recipientError);
      }
    });

    // --- Phase 2: one students lookup for every recipient at once ------------
    // Was a query per recipient (N+1). The ids are only knowable after phase 1,
    // so this sits between the phases rather than "up front".
    // Initials-only — never full names.
    const allStudentIds = Array.from(
      new Set(
        prepared.flatMap((p) =>
          p.relevant.map((s) => s.student_id).filter((id): id is string => Boolean(id))
        )
      )
    );

    const studentMap = new Map<string, { id: string; initials: string; school_site: string | null }>();
    for (let i = 0; i < allStudentIds.length; i += STUDENT_LOOKUP_CHUNK) {
      const { data: students, error: studentsError } = await supabase
        .from('students')
        .select('id, initials, school_site')
        .in('id', allStudentIds.slice(i, i + STUDENT_LOOKUP_CHUNK));

      // Non-fatal: a missing student renders as "?" (the same fallback v1 used
      // when a lookup came back short), so a partial failure still sends a
      // usable schedule rather than dropping everyone's email.
      if (studentsError) {
        console.error('Error loading students for daily-schedule emails:', studentsError);
        Sentry.captureException(studentsError, { tags: { cron: 'daily-schedule-emails' } });
      }
      for (const st of students ?? []) studentMap.set(st.id, st);
    }

    // --- Phase 3: render + send (concurrent) ---------------------------------
    await inChunks(prepared, CONCURRENCY, async ({ recipient, relevant }) => {
      try {
        const sessionInputs: DailyScheduleSessionInput[] = relevant.map((s) => {
          const student = s.student_id ? studentMap.get(s.student_id) : undefined;
          return {
            startTime: s.start_time,
            endTime: s.end_time,
            studentInitials: student?.initials || '?',
            studentId: s.student_id,
            serviceType: s.service_type,
            groupId: s.group_id,
            schoolSite: student?.school_site ?? null,
          };
        });

        const { subject, html, text } = renderDailyScheduleEmail({
          date,
          sessions: sessionInputs,
          showSchoolSite: recipient.works_at_multiple_schools === true,
          settingsUrl,
        });

        // Resend v4 does NOT throw on API-level errors (invalid recipient,
        // rate limit, etc.) — it resolves with `{ error }`. Surface that as a
        // failure so it's counted and captured, not silently miscounted as sent.
        const { error: sendError } = await withTimeout(
          `Resend send for ${recipient.id}`,
          PER_RECIPIENT_TIMEOUT_MS,
          getResend().emails.send(
            { from: FROM, to: recipient.email!, subject, html, text },
            // A cron retry re-sends the same key → Resend de-dupes, no double-send.
            { idempotencyKey: `daily-schedule-${recipient.id}-${todayStr}` }
          )
        );
        if (sendError) {
          throw new Error(`Resend send failed: ${sendError.message || 'unknown error'}`);
        }

        sent++;
      } catch (recipientError) {
        recordFailure(recipient.id, recipientError);
      }
    });

    console.log(
      `Daily schedule emails: sent=${sent} skipped=${skipped} failed=${failed} (date=${todayStr}, recipients=${recipients?.length ?? 0})`
    );

    return NextResponse.json(
      {
        success: true,
        sent,
        skipped,
        failed,
        recipients: recipients?.length ?? 0,
        date: todayStr,
        processingTimeMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('Unexpected error in daily-schedule-emails cron:', error);
    Sentry.captureException(error, { tags: { cron: 'daily-schedule-emails' } });
    return NextResponse.json(
      {
        success: false,
        error: 'Unexpected error during daily schedule emails',
        details: error?.message || 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for cron services that POST.
export async function POST(request: NextRequest) {
  return GET(request);
}
