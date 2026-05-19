'use client';

// Speddy landing page — "Clean (B)" design direction.

import { useState } from 'react';
import Link from 'next/link';
import {
  AudienceToggle,
  EmailSignup,
  MockMasterScheduleCard,
  MockMinutesCard,
  MockScheduleCard,
  SpeddyMark,
  type Audience,
} from './landing-shared';

const PROVIDER_COPY = {
  eyebrow: 'For SpEd providers',
  headline: 'Your weekly schedule,',
  headlineEm: 'finally in one place.',
  sub: 'Speddy organizes every session, every student, and every service minute so you can focus on the work that matters.',
  cta: 'Get started',
  placeholder: 'you@school.edu',
};
const ADMIN_COPY = {
  eyebrow: 'For school admins',
  headline: 'Your whole school’s schedule,',
  headlineEm: 'in one source of truth.',
  sub: 'Build bell schedules, special activities, yard duty, and SpEd services across every grade — then keep them all in sync as the year evolves.',
  cta: 'Get started',
  placeholder: 'admin@district.edu',
};

export default function CleanLanding() {
  const [audience, setAudience] = useState<Audience>('provider');
  const copy = audience === 'provider' ? PROVIDER_COPY : ADMIN_COPY;
  const isAdmin = audience === 'admin';

  return (
    <div
      style={{
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        color: '#0F172A',
        background: '#F3F5F8',
        minHeight: '100%',
        width: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Nav */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '24px 64px',
          background: '#FFF',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        <SpeddyMark size={34} />
        <Link
          href="/login"
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: '#0F172A',
            textDecoration: 'none',
          }}
        >
          Sign in
        </Link>
      </nav>

      {/* Hero */}
      <section style={{ padding: '72px 64px 56px', textAlign: 'center', background: '#FFF' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <AudienceToggle value={audience} onChange={setAudience} />
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: '#F26B5E',
            letterSpacing: '0.02em',
            marginBottom: 16,
          }}
        >
          {copy.eyebrow}
        </div>
        <h1
          style={{
            fontSize: 64,
            lineHeight: 1.05,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            margin: 0,
            color: '#0F172A',
            maxWidth: 820,
            marginLeft: 'auto',
            marginRight: 'auto',
            textWrap: 'balance',
          }}
        >
          {copy.headline} <span style={{ color: '#2452F5' }}>{copy.headlineEm}</span>
        </h1>
        <p
          style={{
            fontSize: 19,
            lineHeight: 1.5,
            margin: '24px auto 36px',
            color: 'rgba(15,23,42,0.65)',
            maxWidth: 620,
          }}
        >
          {copy.sub}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <EmailSignup cta={copy.cta} placeholder={copy.placeholder} />
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 24,
            marginTop: 20,
            fontSize: 13,
            color: 'rgba(15,23,42,0.55)',
          }}
        >
          <span>✓ FERPA-compliant</span>
          <span>✓ Built with SpEd providers</span>
          <span>✓ Set up in an afternoon</span>
        </div>

        {/* Hero product card */}
        <div style={{ margin: '64px auto 0', maxWidth: 980, position: 'relative' }}>
          <div
            style={{
              position: 'absolute',
              inset: '20px -8px -8px',
              background: 'linear-gradient(180deg, rgba(36,82,245,0.12), rgba(36,82,245,0))',
              borderRadius: 24,
              zIndex: 0,
            }}
          ></div>
          <div
            style={{
              position: 'relative',
              background: '#FFF',
              borderRadius: 20,
              border: '1px solid rgba(15,23,42,0.08)',
              boxShadow:
                '0 40px 80px -40px rgba(15,23,42,0.25), 0 12px 24px -12px rgba(15,23,42,0.08)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '12px 16px',
                borderBottom: '1px solid rgba(15,23,42,0.06)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                style={{ width: 11, height: 11, borderRadius: 999, background: '#F26B5E' }}
              ></span>
              <span
                style={{ width: 11, height: 11, borderRadius: 999, background: '#FBBF24' }}
              ></span>
              <span
                style={{ width: 11, height: 11, borderRadius: 999, background: '#22C55E' }}
              ></span>
              <div
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 12,
                  color: 'rgba(15,23,42,0.45)',
                }}
              >
                speddy.xyz / schedule
              </div>
            </div>
            <div
              style={{
                background: '#F3F5F8',
                padding: 24,
                display: 'grid',
                gridTemplateColumns: '1.4fr 1fr',
                gap: 20,
                alignItems: 'start',
              }}
            >
              {isAdmin ? (
                <MockMasterScheduleCard width="100%" />
              ) : (
                <MockScheduleCard width="100%" />
              )}
              <MockMinutesCard width="100%" />
            </div>
          </div>
        </div>
      </section>

      {/* Pain points */}
      <section style={{ padding: '96px 64px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: '#F26B5E',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Before &amp; after
          </div>
          <h2
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: '12px 0 0',
              color: '#0F172A',
            }}
          >
            {isAdmin
              ? 'From scattered spreadsheets to one schedule.'
              : 'From spreadsheets to one source of truth.'}
          </h2>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 24,
            maxWidth: 1080,
            margin: '0 auto',
          }}
        >
          {/* Before */}
          <div
            style={{
              background: '#FFF',
              border: '1px solid rgba(15,23,42,0.08)',
              borderRadius: 16,
              padding: 32,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: 'rgba(15,23,42,0.5)',
                letterSpacing: '0.08em',
                marginBottom: 12,
              }}
            >
              BEFORE
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', color: '#0F172A' }}>
              {isAdmin
                ? 'A folder of spreadsheets nobody trusts'
                : 'Friday afternoon, three tabs deep'}
            </h3>
            {(isAdmin
              ? [
                  'Bell schedules in one doc, special activities in another',
                  'Yard-duty rotations on a printout in the front office',
                  'Every reorg means re-pasting cells for hours',
                  'No way to see if Music and Library overlap',
                ]
              : [
                  'Hand-built spreadsheets that break every reorg',
                  'Service-minute tallying on the back of an envelope',
                  'Scheduling a student the same time as another provider',
                  'Constantly asking teachers when to pull students',
                ]
            ).map((t, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: 12, padding: '10px 0', alignItems: 'flex-start' }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    flexShrink: 0,
                    marginTop: 1,
                    background: '#FEE2E2',
                    color: '#DC2626',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  ×
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(15,23,42,0.7)' }}>
                  {t}
                </span>
              </div>
            ))}
          </div>
          {/* After */}
          <div
            style={{
              background: '#FFF',
              border: '1px solid #2452F5',
              borderRadius: 16,
              padding: 32,
              boxShadow: '0 20px 40px -20px rgba(36,82,245,0.18)',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#2452F5',
                letterSpacing: '0.08em',
                marginBottom: 12,
              }}
            >
              WITH SPEDDY
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 20px', color: '#0F172A' }}>
              {isAdmin ? 'One master schedule. Always current.' : 'One view. Everything current.'}
            </h3>
            {(isAdmin
              ? [
                  'Bell schedules, special activities & yard duty in one view',
                  'Filter by grade, activity, or zone in a click',
                  'Conflict detection across the whole school',
                  'Roll a schedule forward to next year in seconds',
                ]
              : [
                  'Visual weekly schedule, color-coded by grade',
                  'Live service-minute tracking per student',
                  'Conflict detection before you commit',
                  'Assign sessions to a SEA',
                ]
            ).map((t, i) => (
              <div
                key={i}
                style={{ display: 'flex', gap: 12, padding: '10px 0', alignItems: 'flex-start' }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    flexShrink: 0,
                    marginTop: 1,
                    background: '#DCFCE7',
                    color: '#15803D',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  ✓
                </span>
                <span style={{ fontSize: 15, lineHeight: 1.5, color: 'rgba(15,23,42,0.7)' }}>
                  {t}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section
        style={{
          padding: '96px 64px',
          background: '#FFF',
          borderTop: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto 64px', textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 44,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: 0,
              color: '#0F172A',
            }}
          >
            {isAdmin
              ? 'Everything a principal needs, in one tab.'
              : 'The help your SpEd team is missing.'}
          </h2>
        </div>

        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div
            style={{
              background: '#F3F5F8',
              border: '1px solid rgba(15,23,42,0.06)',
              borderRadius: 20,
              padding: 40,
              display: 'grid',
              gridTemplateColumns: '0.9fr 1.1fr',
              gap: 48,
              alignItems: 'center',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  background: '#EFF5FF',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#2452F5',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  marginBottom: 16,
                }}
              >
                <span
                  style={{ width: 6, height: 6, borderRadius: 999, background: '#2452F5' }}
                ></span>
                {isAdmin ? 'Master schedule' : 'Visual scheduler'}
              </div>
              <h3
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  margin: '0 0 16px',
                  letterSpacing: '-0.02em',
                  color: '#0F172A',
                  lineHeight: 1.15,
                }}
              >
                {isAdmin ? (
                  <>
                    Bell schedules,
                    <br />
                    special activities,
                    <br />
                    yard duty — one view.
                  </>
                ) : (
                  <>
                    See your whole week.
                    <br />
                    Catch the conflicts.
                  </>
                )}
              </h3>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: 'rgba(15,23,42,0.65)',
                  margin: '0 0 24px',
                }}
              >
                {isAdmin
                  ? 'Build your whole school year in Speddy. Stack Music, Library, STEAM, Garden and recess against grade-level bell schedules and yard-duty rotations — then filter by grade, activity, or zone instantly.'
                  : "Drag, drop, color-code by grade. Speddy spots when two sessions overlap, when an SEA isn't free, and when a student's pulled out of their favorite class — then offers a fix before you commit."}
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 8,
                  maxWidth: 360,
                }}
              >
                {(isAdmin
                  ? [
                      'Bell schedule builder',
                      'Special activities',
                      'Yard-duty rotations',
                      'Zone management',
                      'Whole-school conflicts',
                      'Year-over-year copy',
                    ]
                  : [
                      'Conflict detection',
                      'Drag & drop',
                      'Auto-schedule',
                      'Print-friendly',
                      'SEA availability',
                      'Pull-out tracking',
                    ]
                ).map((t) => (
                  <div
                    key={t}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 13,
                      color: 'rgba(15,23,42,0.75)',
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        background: '#DCFCE7',
                        color: '#15803D',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 9,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </span>
                    {t}
                  </div>
                ))}
              </div>
            </div>
            <div
              style={{
                background: '#FFF',
                borderRadius: 12,
                padding: 12,
                border: '1px solid rgba(15,23,42,0.06)',
              }}
            >
              {isAdmin ? (
                <MockMasterScheduleCard width="100%" />
              ) : (
                <MockScheduleCard width="100%" />
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section
        style={{ padding: '96px 64px', background: '#0F172A', color: '#FFF', textAlign: 'center' }}
      >
        <h2
          style={{ fontSize: 48, fontWeight: 700, letterSpacing: '-0.025em', margin: '0 0 12px' }}
        >
          Make your SpEd life easier.
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.7)', margin: '0 0 36px' }}>
          Set up in an afternoon. Designed alongside real SpEd providers.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div style={{ background: '#FFF', padding: 8, borderRadius: 14, maxWidth: 580, width: '100%' }}>
            <EmailSignup cta="Get started" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: '32px 64px',
          background: '#0F172A',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SpeddyMark size={26} color="#FFF" />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            Made by SpEd people, for SpEd people.
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 24,
            fontSize: 13,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          <Link href="/privacy" style={{ color: 'inherit', textDecoration: 'none' }}>
            Privacy
          </Link>
          <Link href="/terms" style={{ color: 'inherit', textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/ferpa" style={{ color: 'inherit', textDecoration: 'none' }}>
            FERPA
          </Link>
          <a
            href="mailto:help@speddy.xyz"
            style={{ color: 'inherit', textDecoration: 'none' }}
          >
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
