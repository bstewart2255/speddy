// "How it works" page — district → site admin → provider walkthrough.
// Same Clean visual language as the landing page (DM Sans, light bg, blue
// primary). Each role gets a subtle accent color for scannability.

import Link from 'next/link';
import {
  EmailSignup,
  MockMinutesCard,
  MockScheduleCard,
  SpeddyMark,
} from './landing-shared';

type Role = 'district' | 'admin' | 'provider';

const ROLE: Record<Role, { name: string; accent: string; soft: string; textOnSoft: string }> = {
  district: { name: 'District', accent: '#1E3A8A', soft: '#EEF2FF', textOnSoft: '#1E3A8A' },
  admin: { name: 'Site admin', accent: '#8B7355', soft: '#F5EFE7', textOnSoft: '#6B5638' },
  provider: { name: 'Provider', accent: '#15803D', soft: '#ECFDF5', textOnSoft: '#15803D' },
};

const SECTION_X = 'clamp(20px, 5vw, 64px)';

const RESPONSIVE_CSS = `
.sp-hiw-section { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(32px, 5vw, 64px); align-items: start; }
.sp-hiw-section-rev > :first-child { grid-column: 2; grid-row: 1; }
.sp-hiw-section-rev > :nth-child(2) { grid-column: 1; grid-row: 1; }
.sp-hiw-bullets-2col { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
.sp-hiw-flow { display: grid; grid-template-columns: 1fr 32px 1fr 32px 1fr; align-items: stretch; }
.sp-hiw-flow-arrow { display: flex; align-items: center; justify-content: center; color: rgba(15,23,42,0.25); }
@media (max-width: 880px) {
  .sp-hiw-section { grid-template-columns: 1fr; }
  .sp-hiw-section-rev > :first-child,
  .sp-hiw-section-rev > :nth-child(2) { grid-column: 1; grid-row: auto; }
  .sp-hiw-bullets-2col { grid-template-columns: 1fr; gap: 0; }
  .sp-hiw-flow { grid-template-columns: 1fr; gap: 16px; }
  .sp-hiw-flow-arrow { transform: rotate(90deg); padding: 4px 0; }
}
`;

function RoleChip({ role, children }: { role: Role; children: React.ReactNode }) {
  const r = ROLE[role];
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 999,
        background: r.soft,
        color: r.textOnSoft,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: 999, background: r.accent }}></span>
      {children}
    </div>
  );
}

function StepNumber({ role, n }: { role: Role; n: string }) {
  const r = ROLE[role];
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: 999,
        background: r.accent,
        color: '#FFF',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 700,
        fontFamily: 'inherit',
        letterSpacing: '-0.02em',
        flexShrink: 0,
        boxShadow: `0 12px 24px -10px ${r.accent}66`,
      }}
    >
      {n}
    </div>
  );
}

function BulletRow({ role, title, body }: { role: Role; title: string; body: string }) {
  const r = ROLE[role];
  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        padding: '14px 0',
        borderBottom: '1px solid rgba(15,23,42,0.06)',
      }}
    >
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          flexShrink: 0,
          marginTop: 2,
          background: r.soft,
          color: r.accent,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{title}</div>
        <div style={{ fontSize: 15, lineHeight: 1.55, color: 'rgba(15,23,42,0.65)' }}>{body}</div>
      </div>
    </div>
  );
}

function ResultPullquote({ role, children }: { role: Role; children: React.ReactNode }) {
  const r = ROLE[role];
  return (
    <div
      style={{
        marginTop: 32,
        padding: '20px 24px',
        background: r.soft,
        borderLeft: `3px solid ${r.accent}`,
        borderRadius: '0 10px 10px 0',
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: r.textOnSoft,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        The result for you
      </div>
      <div style={{ fontSize: 17, lineHeight: 1.5, color: '#0F172A', fontWeight: 500 }}>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// District multi-site overview mock.
// ─────────────────────────────────────────────────────────────────
function MockDistrictOverview() {
  const DISC: Record<string, string> = {
    RSP: '#3B82F6',
    SLP: '#A78BFA',
    OT: '#F59E0B',
    PT: '#22D3EE',
    Psych: '#22C55E',
    Couns: '#F472B6',
  };
  type Site = { name: string; students: number; providers: { i: string; d: string }[]; gap?: string };
  const sites: Site[] = [
    {
      name: 'Lincoln Elementary',
      students: 142,
      providers: [
        { i: 'JR', d: 'RSP' },
        { i: 'MK', d: 'RSP' },
        { i: 'AT', d: 'SLP' },
        { i: 'DB', d: 'OT' },
        { i: 'SP', d: 'Psych' },
      ],
    },
    {
      name: 'Roosevelt K-5',
      students: 118,
      providers: [
        { i: 'EW', d: 'RSP' },
        { i: 'CL', d: 'SLP' },
        { i: 'NH', d: 'OT' },
        { i: 'TG', d: 'PT' },
      ],
    },
    {
      name: 'Garfield Primary',
      students: 96,
      providers: [
        { i: 'BM', d: 'RSP' },
        { i: 'KP', d: 'SLP' },
        { i: 'RV', d: 'Couns' },
      ],
      gap: 'OT vacancy',
    },
    {
      name: 'Madison School',
      students: 134,
      providers: [
        { i: 'LF', d: 'RSP' },
        { i: 'JC', d: 'RSP' },
        { i: 'YO', d: 'SLP' },
        { i: 'AK', d: 'OT' },
        { i: 'MN', d: 'Psych' },
        { i: 'HG', d: 'Couns' },
      ],
    },
    {
      name: 'Adams Elementary',
      students: 87,
      providers: [
        { i: 'PD', d: 'RSP' },
        { i: 'IV', d: 'SLP' },
        { i: 'WS', d: 'OT' },
      ],
    },
    {
      name: 'Jefferson School',
      students: 105,
      providers: [
        { i: 'OC', d: 'RSP' },
        { i: 'ZB', d: 'SLP' },
        { i: 'RT', d: 'PT' },
        { i: 'EM', d: 'Psych' },
      ],
      gap: 'RSP shared 0.5 FTE',
    },
  ];

  const totalProviders = sites.reduce((a, s) => a + s.providers.length, 0);

  return (
    <div
      style={{
        background: '#FFF',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow: '0 24px 60px -20px rgba(15,23,42,0.18), 0 8px 18px -8px rgba(15,23,42,0.08)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
            District staffing · 2025–2026
          </div>
          <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
            6 sites · {totalProviders} providers · 682 students
          </div>
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background: '#F3F5F8',
            color: 'rgba(15,23,42,0.55)',
            fontSize: 11,
            fontWeight: 600,
          }}
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
          Read-only
        </div>
      </div>

      <div
        style={{
          padding: '10px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        {Object.entries(DISC).map(([name, c]) => (
          <span
            key={name}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(15,23,42,0.7)',
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c }}></span>
            {name}
          </span>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 1,
          background: 'rgba(15,23,42,0.06)',
        }}
      >
        {sites.map((s, i) => (
          <div key={i} style={{ background: '#FFF', padding: '14px 18px' }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                marginBottom: 12,
                gap: 8,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{s.name}</div>
                <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)', marginTop: 2 }}>
                  {s.providers.length} providers · {s.students} students
                </div>
              </div>
              {s.gap && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: '#FEF3C7',
                    color: '#92400E',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.gap}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {s.providers.map((p, j) => (
                <div
                  key={j}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 8px 4px 4px',
                    background: DISC[p.d] + '14',
                    borderRadius: 999,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: DISC[p.d],
                      color: '#FFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    {p.i}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: DISC[p.d],
                      letterSpacing: '0.02em',
                    }}
                  >
                    {p.d}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Site-admin "structural data" mock.
// ─────────────────────────────────────────────────────────────────
function MockStructuralData() {
  const rows = [
    { label: 'TK · Morning', time: '8:00 – 11:20', tag: 'Bell', c: '#1E3A8A' },
    { label: 'K · Half day', time: '8:00 – 12:00', tag: 'Bell', c: '#1E3A8A' },
    { label: '1st – 5th', time: '8:00 – 2:45', tag: 'Bell', c: '#1E3A8A' },
    { label: 'Music · 1st & 2nd', time: 'Mon · 9:30', tag: 'Special', c: '#A78BFA' },
    { label: 'Library · 3rd–5th', time: 'Wed · 10:15', tag: 'Special', c: '#3B82F6' },
    { label: 'Recess · upper', time: 'Daily · 10:30', tag: 'Special', c: '#F59E0B' },
    { label: 'Lunch · all grades', time: 'Daily · 11:50', tag: 'Special', c: '#94A3B8' },
  ];
  return (
    <div
      style={{
        background: '#FFF',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow: '0 24px 60px -20px rgba(15,23,42,0.18), 0 8px 18px -8px rgba(15,23,42,0.08)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
          Site setup · Lincoln Elementary
        </div>
        <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
          Bell schedule &amp; specials
        </div>
      </div>
      <div style={{ padding: '8px 0' }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 12,
              alignItems: 'center',
              padding: '10px 20px',
              borderTop: i === 0 ? 'none' : '1px solid rgba(15,23,42,0.05)',
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#0F172A' }}>{row.label}</div>
              <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.55)', marginTop: 2 }}>
                {row.time}
              </div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 6,
                background: row.c + '18',
                color: row.c,
                letterSpacing: '0.04em',
              }}
            >
              {row.tag.toUpperCase()}
            </span>
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background: '#DCFCE7',
                color: '#15803D',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </div>
        ))}
      </div>
      <div
        style={{
          background: '#F5EFE7',
          padding: '12px 20px',
          fontSize: 12,
          color: '#6B5638',
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#8B7355' }}></span>
        Reused by 8 providers across the site
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────
export default function HowItWorksPage() {
  const ROLE_LINKS: { role: Role; label: string }[] = [
    { role: 'district', label: 'District' },
    { role: 'admin', label: 'Site admin' },
    { role: 'provider', label: 'Provider' },
  ];

  return (
    <div
      style={{
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        color: '#0F172A',
        background: '#F3F5F8',
        minHeight: '100%',
        width: '100%',
        overflowX: 'hidden',
        scrollBehavior: 'smooth',
      }}
    >
      <style>{RESPONSIVE_CSS}</style>

      {/* Nav */}
      <nav
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          padding: `clamp(16px, 4vw, 24px) ${SECTION_X}`,
          background: '#FFF',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          flexWrap: 'wrap',
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <SpeddyMark size={34} />
        </Link>
        <Link
          href="/login"
          style={{ fontSize: 15, fontWeight: 600, color: '#0F172A', textDecoration: 'none' }}
        >
          Sign in
        </Link>
      </nav>

      {/* Page header */}
      <section
        style={{
          padding: `clamp(48px, 8vw, 80px) ${SECTION_X} clamp(40px, 6vw, 64px)`,
          background: '#FFF',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: '#2452F5',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 18,
          }}
        >
          How it works
        </div>
        <h1
          style={{
            fontSize: 'clamp(34px, 7vw, 60px)',
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
          How Speddy works <span style={{ color: '#2452F5' }}>for your team.</span>
        </h1>
        <p
          style={{
            fontSize: 'clamp(16px, 2.2vw, 19px)',
            lineHeight: 1.55,
            margin: '24px auto 0',
            color: 'rgba(15,23,42,0.65)',
            maxWidth: 680,
          }}
        >
          A district SpEd director, a site admin, and a provider all open Speddy and see something
          different — because each of them has a different job. Here&apos;s how the pieces fit
          together.
        </p>

        {/* Role legend / jump nav */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 12,
            marginTop: 40,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {ROLE_LINKS.map((r, i, arr) => {
            const c = ROLE[r.role];
            return (
              <span key={r.role} style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <a
                  href={`#${r.role}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '10px 18px',
                    borderRadius: 999,
                    background: '#FFF',
                    border: '1.5px solid rgba(15,23,42,0.1)',
                    textDecoration: 'none',
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#0F172A',
                    fontFamily: 'inherit',
                  }}
                >
                  <span
                    style={{ width: 9, height: 9, borderRadius: 999, background: c.accent }}
                  ></span>
                  {r.label}
                </a>
                {i < arr.length - 1 && (
                  <span style={{ color: 'rgba(15,23,42,0.3)', fontSize: 16 }}>→</span>
                )}
              </span>
            );
          })}
        </div>
      </section>

      {/* ────────── Section 1 · District ────────── */}
      <section
        id="district"
        style={{
          padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`,
          background: '#F3F5F8',
          scrollMarginTop: 24,
        }}
      >
        <div className="sp-hiw-section" style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <StepNumber role="district" n="01" />
              <RoleChip role="district">For district SpEd directors</RoleChip>
            </div>
            <h2
              style={{
                fontSize: 'clamp(28px, 5vw, 42px)',
                fontWeight: 700,
                letterSpacing: '-0.025em',
                margin: '0 0 18px',
                color: '#0F172A',
                lineHeight: 1.1,
              }}
            >
              District-wide visibility,
              <br />
              district-wide control.
            </h2>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.6,
                color: 'rgba(15,23,42,0.7)',
                margin: '0 0 24px',
              }}
            >
              District SpEd directors get a read-only view across every site in the district, plus
              the access controls to add, remove, and re-role users as your team changes. You
              don&apos;t have to build schedules or log sessions yourself — but you can see how
              it&apos;s all going, at any moment, without asking anyone for a status update.
            </p>
            <ResultPullquote role="district">
              Less time chasing status updates. More confidence that what&apos;s happening at each
              site is what&apos;s supposed to be happening.
            </ResultPullquote>
          </div>
          <div>
            <div style={{ marginBottom: 16 }}>
              <MockDistrictOverview />
            </div>
            <div>
              <BulletRow
                role="district"
                title="See across every site"
                body="A live, read-only view of every school in your district — schedules, caseloads, who's serving whom, what's happening this week."
              />
              <BulletRow
                role="district"
                title="Manage users and access"
                body="Add and remove site admins, providers, and related-service staff. Assign roles. Adjust permissions when someone changes buildings or leaves the district."
              />
              <BulletRow
                role="district"
                title="Stay out of the weeds"
                body="Speddy doesn't ask you to schedule sessions or log attendance. It just shows you the work is getting done — and gives your team the tool they've been asking for."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ────────── Section 2 · Site admin ────────── */}
      <section
        id="admin"
        style={{
          padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`,
          background: '#FFF',
          scrollMarginTop: 24,
        }}
      >
        <div
          className="sp-hiw-section sp-hiw-section-rev"
          style={{ maxWidth: 1180, margin: '0 auto' }}
        >
          {/* Text first in DOM (reads first on mobile); reversed on desktop via CSS. */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
              <StepNumber role="admin" n="02" />
              <RoleChip role="admin">For site admins — principals, APs</RoleChip>
            </div>
            <h2
              style={{
                fontSize: 'clamp(28px, 5vw, 42px)',
                fontWeight: 700,
                letterSpacing: '-0.025em',
                margin: '0 0 18px',
                color: '#0F172A',
                lineHeight: 1.1,
              }}
            >
              Set it up once.
              <br />
              Make every August easier.
            </h2>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.6,
                color: 'rgba(15,23,42,0.7)',
                margin: '0 0 24px',
              }}
            >
              Site admins do the one part of Speddy that providers can&apos;t easily do alone: load
              the structural scheduling data — bell schedules, specials, lunches, blackouts.
              It&apos;s data you&apos;re already maintaining somewhere (usually a spreadsheet you
              share each August). Speddy turns it into a reusable foundation that every provider on
              your site builds against.
            </p>
            <ResultPullquote role="admin">
              Your team stops bringing you avoidable scheduling questions. Your existing spreadsheet
              does more work, not more of yours.
            </ResultPullquote>

            <div
              style={{
                marginTop: 24,
                padding: '20px 22px',
                background: '#FAFAF7',
                border: '1px dashed rgba(139,115,85,0.4)',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#8B7355"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: '#6B5638',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}
                >
                  The optional path
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.55,
                  color: 'rgba(15,23,42,0.7)',
                  fontStyle: 'italic',
                }}
              >
                Site admins don&apos;t have to participate for Speddy to be useful. If you don&apos;t
                load the structural data, your providers can enter it themselves and still get the
                full benefit. But it&apos;s substantially better — for everyone, including you —
                when site admins contribute the foundation.
              </p>
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 16 }}>
              <MockStructuralData />
            </div>
            <div>
              <BulletRow
                role="admin"
                title="Set up site scheduling data"
                body="Bell schedules, special activities, lunch and recess blocks. Enter it once, reuse it all year."
              />
              <BulletRow
                role="admin"
                title="See your site in one view"
                body="Live visibility into how SpEd services are running at your school — without having to ask three different people on a Friday afternoon."
              />
              <BulletRow
                role="admin"
                title="Hours, not days"
                body="Setting this up in Speddy takes a fraction of the time it used to take in spreadsheets and email chains before the year starts."
              />
              <BulletRow
                role="admin"
                title="Cut your team's August in half"
                body="When you load the structural data, your providers don't have to. The biggest week of the SpEd year gets shorter for everyone."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ────────── Section 3 · Provider ────────── */}
      <section
        id="provider"
        style={{
          padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`,
          background: '#F3F5F8',
          scrollMarginTop: 24,
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div className="sp-hiw-section">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18 }}>
                <StepNumber role="provider" n="03" />
                <RoleChip role="provider">For SpEd providers</RoleChip>
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'rgba(15,23,42,0.5)',
                  fontWeight: 600,
                  marginBottom: 14,
                  letterSpacing: '0.04em',
                }}
              >
                RSPs · SLPs · OTs · PTs · school psychs · counselors
              </div>
              <h2
                style={{
                  fontSize: 'clamp(28px, 5vw, 42px)',
                  fontWeight: 700,
                  letterSpacing: '-0.025em',
                  margin: '0 0 18px',
                  color: '#0F172A',
                  lineHeight: 1.1,
                }}
              >
                Where the day-to-day work
                <br />
                actually lives.
              </h2>
              <p
                style={{
                  fontSize: 17,
                  lineHeight: 1.6,
                  color: 'rgba(15,23,42,0.7)',
                  margin: '0 0 24px',
                }}
              >
                Providers do the most in Speddy — and get the most out of it. You build your weekly
                schedule against the structural data the admin loaded (or load it yourself if they
                haven&apos;t). You log attendance and lessons in a few clicks. You keep your
                referral queue organized so nothing falls through the cracks. And when something
                changes — and something always changes — you adjust once, in one place.
              </p>
              <ResultPullquote role="provider">
                The August scheduling hill is shorter. The Friday catch-up disappears. The mid-year
                tweaks stop ruining your afternoons.
              </ResultPullquote>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <MockScheduleCard width="100%" />
              <MockMinutesCard width="100%" />
            </div>
          </div>

          <div
            className="sp-hiw-bullets-2col"
            style={{
              marginTop: 56,
              background: '#FFF',
              borderRadius: 16,
              padding: 'clamp(16px, 3vw, 32px)',
              border: '1px solid rgba(15,23,42,0.06)',
            }}
          >
            <div>
              <BulletRow
                role="provider"
                title="Build your weekly schedule, visually"
                body="Drag, drop, color-code by grade. Speddy flags conflicts before you commit — two providers pulling the same kid, an SEA who isn't free, a student whose teacher would rather you pull them at a different time."
              />
              <BulletRow
                role="provider"
                title="Track attendance in a few clicks"
                body="Per session, tied to the schedule that generated it. No re-entering student names. No paper."
              />
              <BulletRow
                role="provider"
                title="Log what you taught"
                body="Quick notes per session: what was worked on, with which students, on which day. Searchable when you need it for a parent meeting, a re-eval, or a colleague taking over your caseload."
              />
            </div>
            <div>
              <BulletRow
                role="provider"
                title="Manage your referral queue"
                body="Incoming referrals from teachers, parents, and private schools — all in one place, with status and next step. Nothing held in your head."
              />
              <BulletRow
                role="provider"
                title="Adjust without panic"
                body="A teacher requests a schedule change. A new student joins your caseload. A group regroups. Speddy lets you adjust once — and everything else updates around it."
              />
              <BulletRow
                role="provider"
                title="Multi-school caseloads"
                body="For related-service providers: one login, one view across the buildings you serve. Group and individual sessions, same schedule, different shapes."
              />
            </div>
          </div>
        </div>
      </section>

      {/* ────────── How the roles fit together ────────── */}
      <section
        style={{
          padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`,
          background: '#FFF',
          borderTop: '1px solid rgba(15,23,42,0.06)',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 720, margin: '0 auto 56px' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: '#F26B5E',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              marginBottom: 14,
            }}
          >
            How it fits together
          </div>
          <h2
            style={{
              fontSize: 'clamp(26px, 5vw, 44px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: 0,
              color: '#0F172A',
            }}
          >
            Three levels. One team. Less friction.
          </h2>
          <p
            style={{
              fontSize: 'clamp(15px, 2vw, 18px)',
              lineHeight: 1.55,
              color: 'rgba(15,23,42,0.65)',
              margin: '20px auto 0',
            }}
          >
            Districts give the team the tool. Site admins lay the foundation. Providers do the daily
            work. Each one does the part they&apos;re best positioned to do — and nobody has to do
            anyone else&apos;s job to make it work.
          </p>
        </div>

        <div className="sp-hiw-flow" style={{ maxWidth: 1080, margin: '0 auto' }}>
          {(
            [
              {
                role: 'district',
                verb: 'gives the tool',
                body: 'A read-only view across every site, plus user & access management.',
              },
              {
                role: 'admin',
                verb: 'lays the foundation',
                body: 'Loads bell schedules, specials, and recess blocks every provider builds against.',
              },
              {
                role: 'provider',
                verb: 'does the daily work',
                body: 'Schedules sessions, logs attendance, tracks goals, manages referrals.',
              },
            ] as { role: Role; verb: string; body: string }[]
          ).map((step, i, arr) => {
            const r = ROLE[step.role];
            const isLast = i === arr.length - 1;
            return (
              <span key={step.role} style={{ display: 'contents' }}>
                <div
                  style={{
                    background: '#F3F5F8',
                    borderRadius: 16,
                    padding: 'clamp(20px, 3vw, 28px)',
                    border: `1.5px solid ${r.accent}22`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 999,
                        background: r.accent,
                        color: '#FFF',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    >
                      0{i + 1}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: r.textOnSoft,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {ROLE[step.role].name}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 'clamp(18px, 2.5vw, 22px)',
                      fontWeight: 700,
                      color: '#0F172A',
                      marginBottom: 8,
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {step.verb}
                  </div>
                  <div style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(15,23,42,0.65)' }}>
                    {step.body}
                  </div>
                </div>
                {!isLast && (
                  <div className="sp-hiw-flow-arrow">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </div>
                )}
              </span>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section
        style={{
          padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`,
          background: '#0F172A',
          color: '#FFF',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(30px, 6vw, 48px)',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            margin: '0 0 14px',
          }}
        >
          Bring Speddy to your district.
        </h2>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            lineHeight: 1.55,
            color: 'rgba(255,255,255,0.7)',
            margin: '0 auto 36px',
            maxWidth: 620,
          }}
        >
          A pilot at one or more sites is the easiest way to see whether Speddy fits your team.
          We&apos;ll handle setup, your providers use it through the pilot window, and we review
          together at the end.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              background: '#FFF',
              padding: 8,
              borderRadius: 14,
              maxWidth: 580,
              width: '100%',
            }}
          >
            <EmailSignup cta="Talk to our team" placeholder="you@district.edu" audience="district" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          padding: `clamp(24px, 4vw, 32px) ${SECTION_X}`,
          background: '#0F172A',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
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
            flexWrap: 'wrap',
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
          <a href="mailto:help@speddy.xyz" style={{ color: 'inherit', textDecoration: 'none' }}>
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
