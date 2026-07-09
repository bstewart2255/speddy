'use client';

// Speddy product-mockup graphics for the landing page.
// Ported from the "Speddy Landing" Claude Design (SpeddyMock.dc.html) — a set of
// self-contained, non-interactive UI recreations shown in the hero product card.
// Each graphic is faithful pixel-mock, driven entirely by the local data below.
//
// `kind` picks the graphic; `type` (school type) adjusts a few labels so the
// same mock reads correctly for public / charter / private schools.

import React from 'react';

export type MockKind =
  | 'schedule'
  | 'minutes'
  | 'master'
  | 'district'
  | 'structural'
  | 'care'
  | 'meetings';

export type SchoolType = 'public' | 'charter' | 'private';

const GRADE = {
  tk: '#F472B6',
  k: '#A78BFA',
  g1: '#3B82F6',
  g2: '#22D3EE',
  g3: '#22C55E',
  g4: '#F59E0B',
  g5: '#EF4444',
} as const;

function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        background: '#FFF',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow:
          '0 24px 60px -20px rgba(15,23,42,0.18), 0 8px 18px -8px rgba(15,23,42,0.08)',
        overflow: 'hidden',
        fontFamily: 'inherit',
        width: '100%',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ── Provider · weekly schedule ──────────────────────────────────────
type Slot = {
  day: number;
  top: number;
  h: number;
  c: string;
  code: string;
  conflict?: boolean;
  off?: number;
};

function ScheduleMock({ type }: { type: SchoolType }) {
  const priv = type === 'private';
  const gradeList: [string, string][] = [
    ['TK', GRADE.tk],
    ['K', GRADE.k],
    ['1st', GRADE.g1],
    ['2nd', GRADE.g2],
    ['3rd', GRADE.g3],
    ['4th', GRADE.g4],
    ['5th', GRADE.g5],
  ];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const slots: Slot[] = [
    { day: 0, top: 0, h: 8, c: GRADE.g3, code: 'JW' },
    { day: 0, top: 8, h: 8, c: GRADE.g3, code: 'SP', conflict: true },
    { day: 1, top: 0, h: 8, c: GRADE.g3, code: 'SP' },
    { day: 1, top: 8, h: 8, c: GRADE.g3, code: 'JW' },
    { day: 2, top: 4, h: 8, c: GRADE.g3, code: 'SP' },
    { day: 3, top: 0, h: 8, c: GRADE.g3, code: 'JW' },
    { day: 3, top: 8, h: 8, c: GRADE.g3, code: 'SP' },
    { day: 4, top: 4, h: 8, c: GRADE.g3, code: 'SP' },
    { day: 0, top: 22, h: 8, c: GRADE.g4, code: 'AC' },
    { day: 0, top: 22, h: 8, c: GRADE.g4, code: 'MM', off: 1 },
    { day: 0, top: 22, h: 16, c: GRADE.g5, code: 'DGI', off: 2 },
    { day: 0, top: 30, h: 8, c: GRADE.g4, code: 'MFI' },
    { day: 1, top: 22, h: 8, c: GRADE.g4, code: 'MM' },
    { day: 1, top: 22, h: 16, c: GRADE.g5, code: 'DGI', off: 1 },
    { day: 1, top: 30, h: 8, c: GRADE.g4, code: 'MFI' },
    { day: 2, top: 22, h: 16, c: GRADE.g5, code: 'DGI' },
    { day: 2, top: 22, h: 8, c: GRADE.g4, code: 'MFI', off: 1 },
    { day: 3, top: 22, h: 8, c: GRADE.g4, code: 'MFI' },
    { day: 3, top: 22, h: 16, c: GRADE.g5, code: 'DGI', off: 1 },
    { day: 4, top: 22, h: 16, c: GRADE.g5, code: 'DGI' },
    { day: 4, top: 22, h: 8, c: GRADE.g4, code: 'MFI', off: 1 },
    { day: 0, top: 60, h: 8, c: GRADE.g5, code: 'ER' },
    { day: 0, top: 60, h: 16, c: GRADE.g5, code: 'DGI', off: 1 },
    { day: 1, top: 60, h: 8, c: GRADE.g5, code: 'ER' },
    { day: 1, top: 60, h: 16, c: GRADE.g5, code: 'DGI', off: 1 },
    { day: 2, top: 60, h: 16, c: GRADE.g5, code: 'DGI' },
    { day: 3, top: 60, h: 8, c: GRADE.g5, code: 'ER' },
    { day: 3, top: 60, h: 16, c: GRADE.g5, code: 'DGI', off: 1 },
    { day: 4, top: 60, h: 8, c: GRADE.g5, code: 'ER' },
    { day: 4, top: 60, h: 16, c: GRADE.g5, code: 'DGI', off: 1 },
  ];
  const times = ['8:00', '9:00', '10:00', '11:00'];

  return (
    <Card>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
            {priv ? 'Support schedule' : 'Main Schedule'}
          </div>
          <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
            This week
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 6,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          {gradeList.map(([l, c]) => (
            <span
              key={l}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 7px',
                borderRadius: 999,
                background: c + '22',
                color: c,
              }}
            >
              {l}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(5, 1fr)', position: 'relative' }}>
        <div />
        {days.map((d) => (
          <div
            key={'d' + d}
            style={{
              padding: '10px 8px',
              fontSize: 11,
              fontWeight: 700,
              color: '#0F172A',
              borderBottom: '1px solid rgba(15,23,42,0.06)',
              textAlign: 'center',
            }}
          >
            {d}
          </div>
        ))}
        {times.map((t, i) => (
          <div
            key={'t' + t}
            style={{
              gridColumn: '1 / 2',
              gridRow: `${i + 2} / span 1`,
              height: 56,
              padding: '6px 8px',
              fontSize: 10,
              color: 'rgba(15,23,42,0.5)',
              borderTop: i === 0 ? 'none' : '1px dashed rgba(15,23,42,0.06)',
            }}
          >
            {t}
          </div>
        ))}
        {days.map((_, di) => (
          <div
            key={'col' + di}
            style={{
              gridColumn: `${di + 2} / span 1`,
              gridRow: '2 / span 4',
              height: 224,
              position: 'relative',
              borderLeft: '1px solid rgba(15,23,42,0.06)',
            }}
          >
            {slots
              .filter((s) => s.day === di)
              .map((s, i) => (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    top: `${(s.top / 80) * 100}%`,
                    height: `${(s.h / 80) * 100}%`,
                    left: `${4 + (s.off || 0) * 26}px`,
                    width: s.code === 'DGI' ? 26 : 22,
                    background: s.c,
                    border: '1.5px solid #FFF',
                    borderRadius: 5,
                    color: '#FFF',
                    fontSize: 8,
                    fontWeight: 700,
                    padding: '3px 2px 0',
                    lineHeight: 1.1,
                    boxShadow: '0 1px 2px rgba(15,23,42,0.18)',
                  }}
                >
                  {s.code}
                  {s.conflict ? (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 2,
                        right: 2,
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        background: '#F59E0B',
                        border: '1px solid #FFF',
                        fontSize: 7,
                        lineHeight: '8px',
                        textAlign: 'center',
                        color: '#FFF',
                        fontWeight: 700,
                      }}
                    >
                      !
                    </div>
                  ) : null}
                </div>
              ))}
          </div>
        ))}
      </div>

      <div
        style={{
          margin: '12px 16px 16px',
          padding: '10px 14px',
          background: '#FFF7E6',
          border: '1px solid #FCD34D',
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          color: '#92400E',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <span>
          <strong>2 conflicts found</strong> · Mon 8:15 AM · JW / SP overlap
        </span>
      </div>
    </Card>
  );
}

// ── Provider · service minutes ──────────────────────────────────────
function MinutesMock({ type }: { type: SchoolType }) {
  const priv = type === 'private';
  const students = [
    { initials: 'AC', name: 'A. Chen', goal: 120, used: 118, c: GRADE.g3 },
    { initials: 'MM', name: 'M. Mendez', goal: 90, used: 92, c: GRADE.g4 },
    { initials: 'DG', name: 'D. Garza', goal: 180, used: 142, c: GRADE.g5 },
    { initials: 'JW', name: 'J. Wilson', goal: 60, used: 60, c: GRADE.g3 },
    { initials: 'ER', name: 'E. Rivera', goal: 90, used: 71, c: GRADE.g5 },
  ];

  return (
    <Card>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
          {(priv ? 'Support minutes' : 'Service minutes') + ' · this month'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>
            92%
          </div>
          <div style={{ fontSize: 13, color: '#22C55E', fontWeight: 600 }}>on track</div>
        </div>
      </div>
      <div style={{ padding: '8px 12px' }}>
        {students.map((s, i) => {
          const pct = Math.min(100, (s.used / s.goal) * 100);
          const over = s.used > s.goal;
          const full = s.used === s.goal;
          const barColor = over ? '#EF4444' : full ? '#22C55E' : s.c;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 8px',
                borderRadius: 10,
              }}
            >
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: s.c + '22',
                  color: s.c,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {s.initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 4,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{s.name}</span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'rgba(15,23,42,0.55)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    <strong style={{ color: over ? '#EF4444' : '#0F172A' }}>{s.used}</strong>/
                    {s.goal} min
                  </span>
                </div>
                <div
                  style={{
                    height: 6,
                    background: 'rgba(15,23,42,0.06)',
                    borderRadius: 999,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{ height: '100%', width: `${pct}%`, background: barColor, borderRadius: 999 }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Site admin · master schedule ────────────────────────────────────
type Activity = { name: string; c: string; bg: string };
type MasterEvent = { d: number; t: number; h: number; col: number; k: string };

function MasterMock() {
  const ACT: Record<string, Activity> = {
    garden: { name: 'Garden', c: '#22C55E', bg: '#DCFCE7' },
    library: { name: 'Library', c: '#3B82F6', bg: '#DBEAFE' },
    music: { name: 'Music', c: '#A78BFA', bg: '#EDE9FE' },
    steam: { name: 'STEAM', c: '#F97316', bg: '#FFEDD5' },
    recess: { name: 'Recess', c: '#F59E0B', bg: '#FEF3C7' },
    lunch: { name: 'Lunch', c: '#94A3B8', bg: '#E2E8F0' },
  };
  const events: MasterEvent[] = [
    { d: 0, t: 0, h: 6, col: 0, k: 'recess' }, { d: 0, t: 0, h: 6, col: 1, k: 'recess' }, { d: 0, t: 0, h: 6, col: 2, k: 'recess' },
    { d: 0, t: 7, h: 12, col: 0, k: 'music' }, { d: 0, t: 7, h: 12, col: 1, k: 'library' },
    { d: 0, t: 21, h: 14, col: 0, k: 'recess' }, { d: 0, t: 21, h: 14, col: 1, k: 'recess' }, { d: 0, t: 21, h: 14, col: 2, k: 'recess' }, { d: 0, t: 21, h: 14, col: 3, k: 'recess' },
    { d: 0, t: 38, h: 12, col: 0, k: 'library' }, { d: 0, t: 38, h: 12, col: 1, k: 'music' },
    { d: 0, t: 52, h: 10, col: 0, k: 'lunch' }, { d: 0, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 0, t: 64, h: 14, col: 0, k: 'music' }, { d: 0, t: 64, h: 14, col: 1, k: 'library' },
    { d: 1, t: 0, h: 6, col: 0, k: 'recess' }, { d: 1, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 1, t: 7, h: 12, col: 0, k: 'garden' }, { d: 1, t: 7, h: 12, col: 1, k: 'steam' },
    { d: 1, t: 21, h: 14, col: 0, k: 'recess' }, { d: 1, t: 21, h: 14, col: 1, k: 'recess' }, { d: 1, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 1, t: 38, h: 12, col: 0, k: 'steam' }, { d: 1, t: 38, h: 12, col: 1, k: 'garden' },
    { d: 1, t: 52, h: 10, col: 0, k: 'lunch' }, { d: 1, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 1, t: 64, h: 14, col: 0, k: 'library' }, { d: 1, t: 64, h: 14, col: 1, k: 'music' },
    { d: 2, t: 0, h: 6, col: 0, k: 'recess' }, { d: 2, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 2, t: 7, h: 12, col: 0, k: 'steam' }, { d: 2, t: 7, h: 12, col: 1, k: 'steam' },
    { d: 2, t: 21, h: 14, col: 0, k: 'recess' }, { d: 2, t: 21, h: 14, col: 1, k: 'recess' }, { d: 2, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 2, t: 38, h: 12, col: 0, k: 'garden' }, { d: 2, t: 38, h: 12, col: 1, k: 'garden' },
    { d: 2, t: 52, h: 10, col: 0, k: 'lunch' }, { d: 2, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 2, t: 64, h: 14, col: 0, k: 'music' }, { d: 2, t: 64, h: 14, col: 1, k: 'music' },
    { d: 3, t: 0, h: 6, col: 0, k: 'recess' }, { d: 3, t: 0, h: 6, col: 1, k: 'recess' }, { d: 3, t: 0, h: 6, col: 2, k: 'recess' },
    { d: 3, t: 7, h: 12, col: 0, k: 'music' }, { d: 3, t: 7, h: 12, col: 1, k: 'steam' },
    { d: 3, t: 21, h: 14, col: 0, k: 'recess' }, { d: 3, t: 21, h: 14, col: 1, k: 'recess' }, { d: 3, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 3, t: 38, h: 12, col: 0, k: 'library' }, { d: 3, t: 38, h: 12, col: 1, k: 'steam' },
    { d: 3, t: 52, h: 10, col: 0, k: 'lunch' }, { d: 3, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 3, t: 64, h: 14, col: 0, k: 'garden' }, { d: 3, t: 64, h: 14, col: 1, k: 'library' },
    { d: 4, t: 0, h: 6, col: 0, k: 'recess' }, { d: 4, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 4, t: 7, h: 12, col: 0, k: 'library' }, { d: 4, t: 38, h: 12, col: 0, k: 'music' }, { d: 4, t: 38, h: 12, col: 1, k: 'library' },
    { d: 4, t: 21, h: 14, col: 0, k: 'recess' }, { d: 4, t: 21, h: 14, col: 1, k: 'recess' },
    { d: 4, t: 52, h: 10, col: 0, k: 'lunch' }, { d: 4, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 4, t: 64, h: 14, col: 0, k: 'steam' }, { d: 4, t: 64, h: 14, col: 1, k: 'garden' },
  ];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const zones = ['Basketball', 'Kinder Yard', 'Playstructure', 'Grass Area'];

  return (
    <Card>
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
              Master Schedule
            </div>
            <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)', marginTop: 2 }}>
              School year 2025–2026
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, padding: 3, background: '#F3F5F8', borderRadius: 8 }}>
            {['All', 'Bell', 'Special', 'Yard'].map((t, i) => (
              <span
                key={t}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  padding: '4px 9px',
                  borderRadius: 6,
                  background: i === 0 ? '#FFF' : 'transparent',
                  color: i === 0 ? '#0F172A' : 'rgba(15,23,42,0.55)',
                  boxShadow: i === 0 ? '0 1px 2px rgba(15,23,42,0.08)' : 'none',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {Object.entries(ACT)
            .slice(0, 4)
            .map(([k, v]) => (
              <span
                key={k}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 8px',
                  borderRadius: 999,
                  background: v.bg,
                  color: v.c,
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 999, background: v.c }} />
                {v.name}
              </span>
            ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {zones.map((z) => (
            <span
              key={z}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                background: '#FEF3C7',
                color: '#92400E',
                fontSize: 10,
                fontWeight: 600,
                border: '1px solid #FCD34D',
              }}
            >
              {z}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(5, 1fr)', position: 'relative' }}>
        <div />
        {days.map((d) => (
          <div
            key={'d' + d}
            style={{
              padding: '8px 4px',
              fontSize: 10,
              fontWeight: 700,
              color: '#0F172A',
              borderBottom: '1px solid rgba(15,23,42,0.06)',
              textAlign: 'center',
            }}
          >
            {d}
          </div>
        ))}
        {['8AM', '10AM', '12PM', '2PM'].map((t, i) => (
          <div
            key={'t' + t}
            style={{
              gridColumn: '1 / 2',
              gridRow: `${i + 2} / span 1`,
              height: 70,
              padding: '4px 6px',
              fontSize: 9,
              color: 'rgba(15,23,42,0.5)',
              borderTop: i === 0 ? 'none' : '1px dashed rgba(15,23,42,0.06)',
            }}
          >
            {t}
          </div>
        ))}
        {days.map((_, di) => (
          <div
            key={'c' + di}
            style={{
              gridColumn: `${di + 2} / span 1`,
              gridRow: '2 / span 4',
              height: 280,
              position: 'relative',
              borderLeft: '1px solid rgba(15,23,42,0.06)',
              padding: '0 2px',
            }}
          >
            {events
              .filter((e) => e.d === di)
              .map((e, i) => {
                const act = ACT[e.k];
                return (
                  <div
                    key={i}
                    style={{
                      position: 'absolute',
                      top: `${e.t}%`,
                      height: `${e.h}%`,
                      left: `${2 + e.col * 24}%`,
                      width: '22%',
                      background: act.bg,
                      borderLeft: `2.5px solid ${act.c}`,
                      borderRadius: 3,
                      padding: '2px 3px',
                      fontSize: 7,
                      fontWeight: 700,
                      color: act.c,
                      lineHeight: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {act.name[0]}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── District · staffing overview ────────────────────────────────────
type Site = {
  name: string;
  students: number;
  providers: [string, string][];
  gap?: string;
};

function DistrictMock() {
  const DISC: Record<string, string> = {
    RSP: '#3B82F6',
    SLP: '#A78BFA',
    OT: '#F59E0B',
    PT: '#22D3EE',
    Psych: '#22C55E',
    Couns: '#F472B6',
  };
  const sites: Site[] = [
    { name: 'Lincoln Elementary', students: 142, providers: [['JR', 'RSP'], ['MK', 'RSP'], ['AT', 'SLP'], ['DB', 'OT'], ['SP', 'Psych']] },
    { name: 'Roosevelt K-5', students: 118, providers: [['EW', 'RSP'], ['CL', 'SLP'], ['NH', 'OT'], ['TG', 'PT']] },
    { name: 'Garfield Primary', students: 96, providers: [['BM', 'RSP'], ['KP', 'SLP'], ['RV', 'Couns']], gap: 'OT vacancy' },
    { name: 'Madison School', students: 134, providers: [['LF', 'RSP'], ['JC', 'RSP'], ['YO', 'SLP'], ['AK', 'OT'], ['MN', 'Psych'], ['HG', 'Couns']] },
    { name: 'Adams Elementary', students: 87, providers: [['PD', 'RSP'], ['IV', 'SLP'], ['WS', 'OT']] },
    { name: 'Jefferson School', students: 105, providers: [['OC', 'RSP'], ['ZB', 'SLP'], ['RT', 'PT'], ['EM', 'Psych']], gap: 'RSP shared 0.5 FTE' },
  ];
  const total = sites.reduce((a, s) => a + s.providers.length, 0);

  return (
    <Card>
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
            {`6 sites · ${total} providers · 682 students`}
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
            <span style={{ width: 8, height: 8, borderRadius: 2, background: c }} />
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
                  {`${s.providers.length} providers · ${s.students} students`}
                </div>
              </div>
              {s.gap ? (
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
              ) : null}
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
                    background: DISC[p[1]] + '14',
                    borderRadius: 999,
                  }}
                >
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 999,
                      background: DISC[p[1]],
                      color: '#FFF',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                    }}
                  >
                    {p[0]}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: DISC[p[1]], letterSpacing: '0.02em' }}>
                    {p[1]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Site admin · structural setup ───────────────────────────────────
function StructuralMock() {
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
    <Card>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
          Site setup · Lincoln Elementary
        </div>
        <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
          Bell schedule & specials
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
              <div style={{ fontSize: 12, color: 'rgba(15,23,42,0.55)', marginTop: 2 }}>{row.time}</div>
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
        <span style={{ width: 7, height: 7, borderRadius: 999, background: '#8B7355' }} />
        Reused by 8 providers across the site
      </div>
    </Card>
  );
}

// ── CARE · referral queue ───────────────────────────────────────────
function CareMock({ type }: { type: SchoolType }) {
  const priv = type === 'private';
  const cases = [
    { name: 'R. Okafor · 2nd', type: 'Compliance', c: '#DC2626', bg: '#FEE2E2', due: 'Plan due Feb 3', lane: priv ? 'Learning-support review' : 'Assessment plan · 15 days' },
    { name: 'T. Nguyen · 4th', type: 'Behavioral', c: '#F59E0B', bg: '#FEF3C7', due: 'SST Feb 11', lane: 'Action items · 2 open' },
    { name: 'M. Silva · 1st', type: 'Academic', c: '#3B82F6', bg: '#DBEAFE', due: 'Review Feb 18', lane: 'Discussion lane' },
    { name: 'K. Brooks · 5th', type: 'Speech', c: '#A78BFA', bg: '#EDE9FE', due: 'Follow-up Feb 24', lane: 'Active case' },
  ];

  return (
    <Card>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
            CARE · referral queue
          </div>
          <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
            4 active cases
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 999,
            background: '#FEE2E2',
            color: '#DC2626',
          }}
        >
          1 clock running
        </span>
      </div>
      <div style={{ padding: '6px 12px' }}>
        {cases.map((c, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 8px',
              borderTop: i === 0 ? 'none' : '1px solid rgba(15,23,42,0.05)',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 6,
                background: c.bg,
                color: c.c,
                flexShrink: 0,
                minWidth: 74,
                textAlign: 'center',
              }}
            >
              {c.type}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{c.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)', marginTop: 1 }}>{c.lane}</div>
            </div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(15,23,42,0.6)',
                whiteSpace: 'nowrap',
              }}
            >
              {c.due}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── Meetings · planning queue ───────────────────────────────────────
function MeetingsMock({ type }: { type: SchoolType }) {
  const priv = type === 'private';
  const rows = [
    { name: 'A. Chen', date: 'Feb 12 · 9:00', status: 'Confirmed', c: '#15803D', bg: '#DCFCE7' },
    { name: 'D. Garza', date: 'Feb 12 · 10:30', status: 'Family invited', c: '#2452F5', bg: '#EFF5FF' },
    { name: 'E. Rivera', date: 'Feb 14 · 1:15', status: 'Held', c: '#8B7355', bg: '#F5EFE7' },
    { name: 'M. Mendez', date: 'Feb 19 · 9:45', status: 'Confirmed', c: '#15803D', bg: '#DCFCE7' },
    { name: 'J. Wilson', date: 'unscheduled', status: 'Needs slot', c: '#DC2626', bg: '#FEE2E2' },
  ];

  return (
    <Card>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(15,23,42,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
            {(priv ? 'Support-plan meetings' : 'IEP meetings') + ' · this term'}
          </div>
          <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
            12 due · 8 placed
          </div>
        </div>
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            padding: '4px 10px',
            borderRadius: 999,
            background: '#EFF5FF',
            color: '#2452F5',
          }}
        >
          Rolling out
        </span>
      </div>
      <div style={{ padding: '6px 12px' }}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 8px',
              borderTop: i === 0 ? 'none' : '1px solid rgba(15,23,42,0.05)',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{r.name}</div>
              <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)', marginTop: 1 }}>{r.date}</div>
            </div>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '4px 9px',
                borderRadius: 999,
                background: r.bg,
                color: r.c,
                whiteSpace: 'nowrap',
              }}
            >
              {r.status}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function SpeddyMock({
  kind = 'schedule',
  type = 'public',
}: {
  kind?: MockKind;
  type?: SchoolType;
}) {
  switch (kind) {
    case 'minutes':
      return <MinutesMock type={type} />;
    case 'master':
      return <MasterMock />;
    case 'district':
      return <DistrictMock />;
    case 'structural':
      return <StructuralMock />;
    case 'care':
      return <CareMock type={type} />;
    case 'meetings':
      return <MeetingsMock type={type} />;
    default:
      return <ScheduleMock type={type} />;
  }
}

export default SpeddyMock;
