'use client';

// Speddy landing page — "Capabilities reorganization" design direction.
//
// Ported from the "Speddy Landing" Claude Design (Speddy Landing.dc.html). A
// three-axis selector (school type / level / role) drives the hero copy, the
// product mockups, the capability cards, and a contextual banner — so a public
// elementary provider and a charter district director each see a page written
// for them. All content is derived from `resolve(sel)`.
//
// Responsive: clamp() handles type/spacing, flex-wrap handles rows, and a small
// media-query block collapses the two-column grids on narrow screens.

import { useState } from 'react';
import Link from 'next/link';
import { SpeddyMark, EmailSignup, type Audience } from './landing-shared';
import { SpeddyMock, type MockKind, type SchoolType } from './speddy-mock';

type Level = 'elementary' | 'secondary';
type Role = 'district' | 'site' | 'provider';
type Sel = { type: SchoolType; level: Level; role: Role };
type StatusKey = 'live' | 'rolling' | 'dev';

const ST: Record<StatusKey, { label: string; color: string; bg: string }> = {
  live: { label: 'Available now', color: '#15803D', bg: '#DCFCE7' },
  rolling: { label: 'Rolling out', color: '#2452F5', bg: '#EFF5FF' },
  dev: { label: 'In development', color: '#92400E', bg: '#FEF3C7' },
};

type RawCap = { name: string; status: StatusKey; benefit: string; note: string };
type Cap = RawCap & { stLabel: string; stColor: string; stBg: string; hasNote: boolean };
type Banner = { label: string; text: string; bg: string; border: string; dot: string };

type Resolved = {
  hero: { eyebrow: string; h1: string; h1em: string; sub: string };
  caps: Cap[];
  capsHeadline: string;
  closing: string;
  placeholder: string;
  supporting: string;
  primaryGraphic: MockKind;
  secondaryGraphic: MockKind | null;
  hasSecondary: boolean;
  gridCols: string;
  appUrl: string;
  banner: Banner | null;
};

const SECTION_X = 'clamp(20px, 5vw, 64px)';

const TYPE_OPTS: [SchoolType, string][] = [
  ['public', 'Public'],
  ['charter', 'Charter'],
  ['private', 'Private'],
];
const LEVEL_OPTS: [Level, string][] = [
  ['elementary', 'Elementary'],
  ['secondary', 'Middle / High'],
];
const ROLE_OPTS: [Role, string][] = [
  ['district', 'District'],
  ['site', 'Site admin'],
  ['provider', 'Provider'],
];

const ROLE_TO_AUDIENCE: Record<Role, Audience> = {
  provider: 'provider',
  site: 'admin',
  district: 'district',
};

const RESPONSIVE_CSS = `
.sp-selbar { display: flex; flex-wrap: wrap; gap: 22px 28px; align-items: center; justify-content: center; }
.sp-heroprod { display: grid; gap: 18px; align-items: start; }
.sp-caps { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
@media (max-width: 760px) {
  .sp-heroprod { grid-template-columns: 1fr !important; }
  .sp-caps { grid-template-columns: 1fr; }
  .sp-selgroup { justify-content: center; }
}
`;

function resolve(sel: Sel): Resolved {
  const { type, level, role } = sel;
  const isPriv = type === 'private';
  const isCharter = type === 'charter';
  const isSec = level === 'secondary';

  let caps: RawCap[] = [];
  let hero = { eyebrow: '', h1: '', h1em: '', sub: '' };
  let primaryGraphic: MockKind = 'schedule';
  let secondaryGraphic: MockKind | null = null;
  let capsHeadline = '';
  let closing = '';
  let placeholder = 'you@school.edu';
  let appUrl = 'speddy.xyz / schedule';

  if (role === 'provider') {
    hero = {
      eyebrow: 'For SpEd providers',
      h1: isSec ? 'Your caseload,' : 'Your whole week,',
      h1em: isSec ? 'organized and in reach.' : 'finally in one place.',
      sub:
        'Speddy organizes every session, student and ' +
        (isPriv ? 'support minute' : 'service minute') +
        ' so you can focus on the work that matters' +
        (isSec ? ' — caseload-first for your middle and high schoolers.' : '.'),
    };
    capsHeadline = 'The help your day has been missing.';
    closing = 'Get your week back.';
    placeholder = 'you@school.edu';
    primaryGraphic = isSec ? 'care' : 'schedule';
    secondaryGraphic = isSec ? 'meetings' : 'minutes';
    appUrl = isSec ? 'speddy.xyz / caseload' : 'speddy.xyz / schedule';
    caps = [
      {
        name: 'Visual weekly schedule',
        status: isSec ? 'dev' : 'live',
        benefit: isSec
          ? 'The scheduler built around a bell-schedule day. Period-based scheduling for middle & high is in active development.'
          : 'Every session for every student, built by drag-and-drop and color-coded by grade — with conflict detection before you commit.',
        note: isSec
          ? 'Today at your level you get everything below: caseload, meetings, referrals and progress.'
          : '',
      },
      {
        name: isPriv ? 'Support plans & caseload' : 'Students & caseload',
        status: 'live',
        benefit: isPriv
          ? 'Every student you support in one place — goals, accommodations, assessments and support-plan details, imported from the file you already keep.'
          : 'Every student in one place — grade, teacher, service minutes, goals and due dates. Import in bulk or straight from a SEIS export.',
        note:
          isSec && !isPriv
            ? 'Caseload-first at secondary: goals, accommodations and assessments; session/minute fields are hidden.'
            : isPriv
              ? 'IEP-specific fields (triennials, IDEA categories) don’t apply to support plans.'
              : '',
      },
      {
        name: isPriv ? 'Support-plan meetings' : 'IEP meeting planning',
        status: 'rolling',
        benefit: isPriv
          ? 'Plan support-plan and family meetings around everyone’s availability — the same scheduling engine, without the IDEA compliance clock.'
          : 'Plan a whole term of meetings that respect the team’s availability and the site’s capacity — families confirm by text or phone, no account. Works K-12.',
        note: '',
      },
      {
        name: 'Referral tracking (CARE)',
        status: 'live',
        benefit: isPriv
          ? 'A shared queue for student concerns: a teacher or staff concern enters a pending queue and becomes an active learning-support case.'
          : 'A shared queue for every concern — academic, behavioral, speech, OT — with two intake lanes and the assessment-plan clock calculated for you.',
        note: isPriv
          ? 'The statutory compliance lane belongs to the local district, so it’s off here.'
          : '',
      },
      {
        name: 'Progress monitoring',
        status: 'live',
        benefit:
          'Exit tickets and progress checks turn into per-goal trend dashboards — evidence collected as you work, not reconstructed before a meeting.',
        note: isSec ? 'Goal-driven tools work at secondary; attendance widgets are hidden.' : '',
      },
      {
        name: 'Multi-school caseloads',
        status: 'live',
        benefit:
          'One login across every building you serve — a separate caseload and schedule per site, each showing that school’s appropriate view.',
        note: '',
      },
    ];
  } else if (role === 'site') {
    hero = {
      eyebrow: 'For site admins — principals & APs',
      h1: 'Your whole school’s schedule,',
      h1em: 'in one source of truth.',
      sub: 'Build bell schedules, special activities, yard duty and SpEd services across every grade — then keep them in sync as the year evolves.',
    };
    capsHeadline = 'Everything a principal needs, in one tab.';
    closing = 'Make every August easier.';
    placeholder = 'admin@school.edu';
    primaryGraphic = 'master';
    secondaryGraphic = 'structural';
    appUrl = 'speddy.xyz / master-schedule';
    caps = [
      {
        name: 'Master Schedule',
        status: 'live',
        benefit:
          'Bell schedules, special activities and yard-duty rotations for the whole school in one view — filter by grade, activity or zone, and roll it forward to next year.',
        note: '',
      },
      {
        name: 'The foundation your team builds on',
        status: 'live',
        benefit:
          'Enter the structural data once and every provider schedules against it — no more re-sharing the August spreadsheet.',
        note: '',
      },
      {
        name: isPriv ? 'Support-plan meeting rules' : 'IEP meeting rules & capacity',
        status: 'live',
        benefit:
          'Set meeting days, room capacity and blackout windows once; teachers answer a one-time availability preference. The year-at-a-glance dashboard is rolling out.',
        note: '',
      },
      {
        name: 'Referral oversight (CARE)',
        status: 'live',
        benefit:
          'See your school’s whole referral queue — every concern, its status and next step — instead of sticky notes and hallway conversations.',
        note: isPriv ? 'The statutory compliance lane belongs to the local district.' : '',
      },
      {
        name: 'Staff & account administration',
        status: isPriv ? 'dev' : 'live',
        benefit: isPriv
          ? 'Standalone private-school accounts need the org-model work that’s on the way — today a school sits under a district record.'
          : 'Create teacher and staff accounts, manage your directories and resolve duplicates — accounts are admin-created, part of the FERPA posture.',
        note: isCharter ? 'A charter that’s its own LEA is modeled as a one-school district today.' : '',
      },
      {
        name: 'School-wide visibility',
        status: 'live',
        benefit:
          'Live oversight of how SpEd services are running at your site — without asking three people on a Friday afternoon.',
        note: '',
      },
    ];
  } else {
    hero = {
      eyebrow: 'For district SpEd directors',
      h1: 'Every site at a glance,',
      h1em: 'without chasing anyone.',
      sub:
        'A read-only window into every school in your ' +
        (isCharter ? 'network' : 'district') +
        ' — plus the access controls to manage who sees what.',
    };
    capsHeadline = 'Visibility and control, zero data entry.';
    closing = isCharter ? 'Bring Speddy to your network.' : 'Bring Speddy to your district.';
    placeholder = 'you@district.edu';
    primaryGraphic = 'district';
    secondaryGraphic = null;
    appUrl = 'speddy.xyz / district';
    caps = [
      {
        name: 'District-wide visibility',
        status: 'live',
        benefit:
          'A live, read-only view of every school — schedules, caseloads, who’s serving whom, what’s happening this week.',
        note: '',
      },
      {
        name: 'User & access management',
        status: 'live',
        benefit:
          'Add, remove and re-role site admins, providers and staff as people change buildings or leave. Scope site admins to their schools.',
        note: '',
      },
      {
        name: 'Referral oversight across schools',
        status: 'live',
        benefit:
          'The whole ' +
          (isCharter ? 'network' : 'district') +
          '’s CARE queue in one place — including the private-school referrals your district receives.',
        note: '',
      },
      {
        name: 'Caseload & schedule oversight',
        status: 'live',
        benefit:
          'See every site’s caseloads and provider schedules without building or logging anything yourself.',
        note: '',
      },
      {
        name: 'Meetings dashboard',
        status: 'dev',
        benefit:
          'A year-at-a-glance compliance view — due dates without a meeting, at-risk meetings — is planned as Meetings rolls out.',
        note: '',
      },
      {
        name: isCharter ? 'The network is your scope' : 'The district is your scope',
        status: 'live',
        benefit:
          'Multi-school by design — everything rolls up to you, deliberately read-oriented so you never touch a schedule.',
        note: isCharter ? 'A single-LEA charter is represented today as a one-school district.' : '',
      },
    ];
  }

  let banner: Banner | null = null;
  if (isCharter) {
    banner = {
      label: 'For charter schools',
      text: 'Charters run IEPs under IDEA, so Speddy fits nearly as-is — the difference is who buys. No district sign-off needed, and it runs alongside SEIS (SEIS writes the IEP; Speddy schedules and manages delivery).',
      bg: '#EFF5FF',
      border: '#BBD0FF',
      dot: '#2452F5',
    };
  } else if (isPriv) {
    banner = {
      label: 'For private & independent schools',
      text: 'Speddy fits your discretionary learning-support program — learning specialists, support plans and the sessions you choose to deliver. The IEP compliance layer belongs to the local public district, not you. Standalone onboarding is on the way; most mechanics already fit.',
      bg: '#FDF2F8',
      border: '#F6C9E0',
      dot: '#DB2777',
    };
  }

  const supporting =
    'Teachers see when their students are pulled and flag their own class activities; SEAs get a daily plan of exactly where to be; families confirm meeting times by text or phone — no account, ever.';

  const stamp = (c: RawCap): Cap => {
    const s = ST[c.status];
    return { ...c, stLabel: s.label, stColor: s.color, stBg: s.bg, hasNote: !!c.note };
  };

  return {
    hero,
    caps: caps.map(stamp),
    capsHeadline,
    closing,
    placeholder,
    supporting,
    primaryGraphic,
    secondaryGraphic,
    hasSecondary: !!secondaryGraphic,
    gridCols: secondaryGraphic ? '1.4fr 1fr' : '1fr',
    appUrl,
    banner,
  };
}

function PillGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="sp-selgroup" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(15,23,42,0.4)',
        }}
      >
        {label}
      </span>
      <div
        role="group"
        aria-label={label}
        style={{
          display: 'inline-flex',
          padding: 4,
          background: '#EEF2F7',
          borderRadius: 999,
          gap: 2,
        }}
      >
        {options.map(([key, lbl]) => {
          const active = value === key;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(key)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                border: 0,
                padding: '8px 15px',
                borderRadius: 999,
                fontSize: 13.5,
                fontWeight: 600,
                fontFamily: 'inherit',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all .15s',
                background: active ? '#FFFFFF' : 'transparent',
                color: active ? '#0F172A' : 'rgba(15,23,42,0.55)',
                boxShadow: active
                  ? '0 1px 2px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.06)'
                  : 'none',
              }}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SpeddyLanding() {
  const [sel, setSel] = useState<Sel>({ type: 'public', level: 'elementary', role: 'site' });
  const data = resolve(sel);
  const audience = ROLE_TO_AUDIENCE[sel.role];

  return (
    <div
      style={{
        fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
        color: '#0F172A',
        background: '#F3F5F8',
        minHeight: '100%',
        width: '100%',
        // `clip` (not `hidden`) guards against horizontal overflow WITHOUT
        // turning this wrapper into a scroll container — `overflow-x: hidden`
        // would promote overflow-y to `auto` and break the sticky selector bar.
        overflowX: 'clip',
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
        <SpeddyMark size={32} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, fontSize: 15, fontWeight: 600 }}>
          <a href="#how" style={{ color: '#0F172A', textDecoration: 'none' }}>
            How it works
          </a>
          <Link href="/login" style={{ color: '#0F172A', textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </nav>

      {/* Selector bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          background: 'rgba(255,255,255,0.9)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderBottom: '1px solid rgba(15,23,42,0.08)',
          padding: `14px ${SECTION_X}`,
        }}
      >
        <div className="sp-selbar">
          <PillGroup
            label="School type"
            options={TYPE_OPTS}
            value={sel.type}
            onChange={(type) => setSel((s) => ({ ...s, type }))}
          />
          <PillGroup
            label="Level"
            options={LEVEL_OPTS}
            value={sel.level}
            onChange={(level) => setSel((s) => ({ ...s, level }))}
          />
          <PillGroup
            label="Role"
            options={ROLE_OPTS}
            value={sel.role}
            onChange={(role) => setSel((s) => ({ ...s, role }))}
          />
        </div>
      </div>

      {/* Hero */}
      <section
        id="top"
        style={{
          background: '#FFF',
          padding: `clamp(44px, 7vw, 76px) ${SECTION_X} clamp(40px, 6vw, 60px)`,
          textAlign: 'center',
          scrollMarginTop: 80,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: '#F26B5E',
            marginBottom: 14,
          }}
        >
          {data.hero.eyebrow}
        </div>
        <h1
          style={{
            fontSize: 'clamp(34px, 7vw, 60px)',
            lineHeight: 1.05,
            fontWeight: 800,
            letterSpacing: '-0.03em',
            margin: '0 auto',
            maxWidth: 760,
            color: '#0F172A',
            textWrap: 'balance',
          }}
        >
          {data.hero.h1} <span style={{ color: '#2452F5' }}>{data.hero.h1em}</span>
        </h1>
        <p
          style={{
            fontSize: 'clamp(16px, 2.2vw, 19px)',
            lineHeight: 1.5,
            margin: '22px auto 30px',
            color: 'rgba(15,23,42,0.65)',
            maxWidth: 600,
          }}
        >
          {data.hero.sub}
        </p>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <EmailSignup placeholder={data.placeholder} audience={audience} />
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '8px 24px',
            marginTop: 18,
            fontSize: 13,
            color: 'rgba(15,23,42,0.55)',
          }}
        >
          <span>✓ FERPA-compliant</span>
          <span>✓ Built with SpEd providers</span>
          <span>✓ Set up in an afternoon</span>
        </div>

        {data.banner ? (
          <div
            style={{
              margin: '34px auto 0',
              maxWidth: 760,
              textAlign: 'left',
              display: 'flex',
              gap: 14,
              padding: '18px 22px',
              background: data.banner.bg,
              border: `1px solid ${data.banner.border}`,
              borderRadius: 14,
            }}
          >
            <span
              style={{
                flexShrink: 0,
                width: 8,
                height: 8,
                borderRadius: 999,
                marginTop: 7,
                background: data.banner.dot,
              }}
            />
            <div>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: data.banner.dot,
                }}
              >
                {data.banner.label}
              </span>
              <div
                style={{
                  fontSize: 14.5,
                  lineHeight: 1.55,
                  color: 'rgba(15,23,42,0.72)',
                  marginTop: 4,
                }}
              >
                {data.banner.text}
              </div>
            </div>
          </div>
        ) : null}

        {/* Product card */}
        <div
          style={{
            margin: 'clamp(40px, 6vw, 60px) auto 0',
            maxWidth: 1000,
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
            <span style={{ width: 11, height: 11, borderRadius: 999, background: '#F26B5E' }} />
            <span style={{ width: 11, height: 11, borderRadius: 999, background: '#FBBF24' }} />
            <span style={{ width: 11, height: 11, borderRadius: 999, background: '#22C55E' }} />
            <div style={{ flex: 1, textAlign: 'center', fontSize: 12, color: 'rgba(15,23,42,0.45)' }}>
              {data.appUrl}
            </div>
          </div>
          <div
            className="sp-heroprod"
            style={{
              background: '#F3F5F8',
              padding: 'clamp(14px, 3vw, 24px)',
              gridTemplateColumns: data.gridCols,
            }}
          >
            <SpeddyMock kind={data.primaryGraphic} type={sel.type} />
            {data.hasSecondary && data.secondaryGraphic ? (
              <SpeddyMock kind={data.secondaryGraphic} type={sel.type} />
            ) : null}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section
        id="how"
        style={{ padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`, scrollMarginTop: 80 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 'clamp(36px, 5vw, 52px)' }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#F26B5E',
            }}
          >
            What Speddy does for you
          </div>
          <h2
            style={{
              fontSize: 'clamp(26px, 5vw, 44px)',
              fontWeight: 700,
              letterSpacing: '-0.025em',
              margin: '12px 0 0',
              color: '#0F172A',
              textWrap: 'balance',
            }}
          >
            {data.capsHeadline}
          </h2>
        </div>
        <div className="sp-caps" style={{ maxWidth: 1000, margin: '0 auto' }}>
          {data.caps.map((cap, i) => (
            <div
              key={i}
              style={{
                background: '#FFF',
                border: '1px solid rgba(15,23,42,0.08)',
                borderRadius: 16,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div
                  style={{
                    fontSize: 17,
                    fontWeight: 700,
                    color: '#0F172A',
                    letterSpacing: '-0.01em',
                    lineHeight: 1.3,
                  }}
                >
                  {cap.name}
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: 999,
                    background: cap.stBg,
                    color: cap.stColor,
                  }}
                >
                  <span
                    style={{ width: 5, height: 5, borderRadius: 999, background: cap.stColor }}
                  />
                  {cap.stLabel}
                </span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.55, color: 'rgba(15,23,42,0.68)' }}>
                {cap.benefit}
              </div>
              {cap.hasNote ? (
                <div
                  style={{
                    fontSize: 12.5,
                    lineHeight: 1.5,
                    color: 'rgba(15,23,42,0.5)',
                    borderTop: '1px dashed rgba(15,23,42,0.1)',
                    paddingTop: 10,
                  }}
                >
                  {cap.note}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Supporting cast */}
      <section
        style={{
          background: '#FFF',
          borderTop: '1px solid rgba(15,23,42,0.06)',
          padding: `clamp(48px, 7vw, 72px) ${SECTION_X}`,
          textAlign: 'center',
        }}
      >
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'rgba(15,23,42,0.4)',
              marginBottom: 12,
            }}
          >
            Everyone around you, included
          </div>
          <p
            style={{
              fontSize: 'clamp(16px, 2.2vw, 19px)',
              lineHeight: 1.6,
              color: 'rgba(15,23,42,0.7)',
              margin: 0,
            }}
          >
            {data.supporting}
          </p>
        </div>
      </section>

      {/* CTA */}
      <section
        style={{
          background: '#0F172A',
          color: '#FFF',
          padding: `clamp(56px, 9vw, 96px) ${SECTION_X}`,
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 'clamp(30px, 6vw, 48px)',
            fontWeight: 700,
            letterSpacing: '-0.025em',
            margin: '0 0 12px',
          }}
        >
          {data.closing}
        </h2>
        <p
          style={{
            fontSize: 'clamp(15px, 2vw, 18px)',
            color: 'rgba(255,255,255,0.7)',
            margin: '0 0 32px',
          }}
        >
          Set up in an afternoon. Designed alongside real SpEd providers.
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              background: '#FFF',
              padding: 8,
              borderRadius: 14,
              width: '100%',
              maxWidth: 544,
            }}
          >
            <EmailSignup placeholder={data.placeholder} audience={audience} />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: '#0F172A',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          padding: `clamp(24px, 4vw, 32px) ${SECTION_X}`,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SpeddyMark size={24} color="#FFF" />
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            Made by SpEd people, for SpEd people.
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 13 }}>
          <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>
            Privacy
          </Link>
          <Link href="/terms" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>
            Terms
          </Link>
          <Link href="/ferpa" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>
            FERPA
          </Link>
          <a
            href="mailto:help@speddy.xyz"
            style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}
          >
            Contact
          </a>
        </div>
      </footer>
    </div>
  );
}
