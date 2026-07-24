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

    for (const recipient of recipients ?? []) {
      try {
        const daySessions = await generator.getSessionsForDateRange(
          recipient.id,
          date,
          date,
          recipient.role
        );

        // SEAs only get sessions actually assigned to them (mirrors weekly-view).
        const relevant =
          recipient.role === 'sea'
            ? daySessions.filter((s) => s.assigned_to_sea_id === recipient.id)
            : daySessions;

        // No email on zero-session days.
        if (relevant.length === 0) {
          skipped++;
          continue;
        }

        if (!recipient.email) {
          skipped++;
          continue;
        }

        // Resolve student initials + site (initials-only — never full names).
        const studentIds = Array.from(
          new Set(relevant.map((s) => s.student_id).filter((id): id is string => Boolean(id)))
        );
        const { data: students } = await supabase
          .from('students')
          .select('id, initials, school_site')
          .in('id', studentIds);
        const studentMap = new Map((students ?? []).map((st) => [st.id, st]));

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

        await getResend().emails.send(
          { from: FROM, to: recipient.email, subject, html, text },
          // A cron retry re-sends the same key → Resend de-dupes, no double-send.
          { idempotencyKey: `daily-schedule-${recipient.id}-${todayStr}` }
        );

        sent++;
      } catch (recipientError) {
        // One recipient's failure must not stop the run.
        failed++;
        console.error(`Failed to send daily schedule to ${recipient.id}:`, recipientError);
        Sentry.captureException(recipientError, {
          tags: { cron: 'daily-schedule-emails' },
          extra: { userId: recipient.id, date: todayStr },
        });
      }
    }

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
