'use client';

// Building blocks for the Speddy landing page, ported from the chosen
// "Clean (B)" design direction. Inline-styled and self-contained.

import { useState } from 'react';

export type Audience = 'provider' | 'admin';

export const GRADE_COLORS = {
  tk: '#F472B6',
  k: '#A78BFA',
  g1: '#3B82F6',
  g2: '#22D3EE',
  g3: '#22C55E',
  g4: '#F59E0B',
  g5: '#EF4444',
};

export const GRADE_LIST = [
  { l: 'TK', c: GRADE_COLORS.tk },
  { l: 'K', c: GRADE_COLORS.k },
  { l: '1st', c: GRADE_COLORS.g1 },
  { l: '2nd', c: GRADE_COLORS.g2 },
  { l: '3rd', c: GRADE_COLORS.g3 },
  { l: '4th', c: GRADE_COLORS.g4 },
  { l: '5th', c: GRADE_COLORS.g5 },
];

// "Speddy" wordmark — Pacifico script, matches the in-app logo.
export function SpeddyMark({
  size = 36,
  color = '#0F172A',
  style,
}: {
  size?: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-logo), cursive',
        fontSize: size,
        lineHeight: 1,
        color,
        letterSpacing: '-0.01em',
        ...style,
      }}
    >
      Speddy
    </span>
  );
}

// Two-tab audience selector (clean theme).
export function AudienceToggle({
  value,
  onChange,
}: {
  value: Audience;
  onChange: (v: Audience) => void;
}) {
  const tabs: { key: Audience; label: string }[] = [
    { key: 'provider', label: 'For SpEd providers' },
    { key: 'admin', label: 'For school admins' },
  ];
  return (
    <div
      style={{
        display: 'inline-flex',
        padding: 4,
        background: '#EEF2F7',
        borderRadius: 999,
        gap: 2,
      }}
    >
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            style={{
              border: 0,
              padding: '8px 16px',
              borderRadius: 999,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              background: active ? '#FFFFFF' : 'transparent',
              color: active ? '#0F172A' : 'rgba(15,23,42,0.55)',
              boxShadow: active
                ? '0 1px 2px rgba(15,23,42,0.08), 0 0 0 1px rgba(15,23,42,0.04)'
                : 'none',
              transition: 'all .15s',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// Email-only signup (clean theme). Posts to /api/landing-signup and shows an
// inline thank-you on success.
export function EmailSignup({
  placeholder = 'you@school.edu',
  cta = 'Get started',
  audience,
}: {
  placeholder?: string;
  cta?: string;
  audience?: Audience;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  if (status === 'done') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '18px 22px',
          background: '#EFF5FF',
          border: '1.5px solid #2452F5',
          borderRadius: 14,
          color: '#1A3DB8',
          maxWidth: 560,
        }}
      >
        <span
          style={{
            width: 32,
            height: 32,
            borderRadius: 999,
            background: '#2452F5',
            color: '#FFF',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg
            width="16"
            height="16"
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
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 2 }}>
            Thanks — we&apos;ll be in touch!
          </div>
          <div style={{ fontSize: 14, opacity: 0.85 }}>
            A real SpEd person will email <strong>{email || 'you'}</strong> within a day.
          </div>
        </div>
      </div>
    );
  }

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (status === 'loading') return;
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      const res = await fetch('/api/landing-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, audience }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || 'Something went wrong. Please try again.');
        setStatus('error');
        return;
      }
      setStatus('done');
    } catch {
      setError('Network error. Please try again.');
      setStatus('error');
    }
  };

  const loading = status === 'loading';

  return (
    <div style={{ maxWidth: 560, width: '100%' }}>
      <form
        onSubmit={onSubmit}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, width: '100%' }}
      >
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            padding: '14px 18px',
            fontSize: 16,
            fontFamily: 'inherit',
            background: '#FFF',
            border: '1.5px solid #D8DEE8',
            borderRadius: 12,
            outline: 'none',
            color: '#0F172A',
          }}
          onFocus={(e) => (e.target.style.borderColor = '#2452F5')}
          onBlur={(e) => (e.target.style.borderColor = '#D8DEE8')}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            flex: '1 1 140px',
            border: 0,
            padding: '14px 22px',
            fontSize: 16,
            fontWeight: 700,
            fontFamily: 'inherit',
            background: '#2452F5',
            color: '#FFF',
            borderRadius: 12,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.7 : 1,
            whiteSpace: 'nowrap',
          }}
        >
          {loading ? 'Sending…' : `${cta} →`}
        </button>
      </form>
      {status === 'error' && error && (
        <div style={{ marginTop: 8, fontSize: 13, color: '#DC2626', textAlign: 'left' }}>
          {error}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Mock UI cards — recreations of the in-app screens.
// ────────────────────────────────────────────────────────────────────

type Slot = {
  day: number;
  top: number;
  h: number;
  c: string;
  code: string;
  conflict?: boolean;
  off?: number;
};

export function MockScheduleCard({ width = 520 }: { width?: string | number }) {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const slots: Slot[] = [
    { day: 0, top: 0, h: 8, c: GRADE_COLORS.g3, code: 'JW' },
    { day: 0, top: 8, h: 8, c: GRADE_COLORS.g3, code: 'SP', conflict: true },
    { day: 1, top: 0, h: 8, c: GRADE_COLORS.g3, code: 'SP' },
    { day: 1, top: 8, h: 8, c: GRADE_COLORS.g3, code: 'JW' },
    { day: 2, top: 4, h: 8, c: GRADE_COLORS.g3, code: 'SP' },
    { day: 3, top: 0, h: 8, c: GRADE_COLORS.g3, code: 'JW' },
    { day: 3, top: 8, h: 8, c: GRADE_COLORS.g3, code: 'SP' },
    { day: 4, top: 4, h: 8, c: GRADE_COLORS.g3, code: 'SP' },

    { day: 0, top: 22, h: 8, c: GRADE_COLORS.g4, code: 'AC' },
    { day: 0, top: 22, h: 8, c: GRADE_COLORS.g4, code: 'MM', off: 1 },
    { day: 0, top: 22, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 2 },
    { day: 0, top: 30, h: 8, c: GRADE_COLORS.g4, code: 'MFI' },
    { day: 1, top: 22, h: 8, c: GRADE_COLORS.g4, code: 'MM' },
    { day: 1, top: 22, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 1 },
    { day: 1, top: 30, h: 8, c: GRADE_COLORS.g4, code: 'MFI' },
    { day: 2, top: 22, h: 16, c: GRADE_COLORS.g5, code: 'DGI' },
    { day: 2, top: 22, h: 8, c: GRADE_COLORS.g4, code: 'MFI', off: 1 },
    { day: 3, top: 22, h: 8, c: GRADE_COLORS.g4, code: 'MFI' },
    { day: 3, top: 22, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 1 },
    { day: 4, top: 22, h: 16, c: GRADE_COLORS.g5, code: 'DGI' },
    { day: 4, top: 22, h: 8, c: GRADE_COLORS.g4, code: 'MFI', off: 1 },

    { day: 0, top: 60, h: 8, c: GRADE_COLORS.g5, code: 'ER' },
    { day: 0, top: 60, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 1 },
    { day: 1, top: 60, h: 8, c: GRADE_COLORS.g5, code: 'ER' },
    { day: 1, top: 60, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 1 },
    { day: 2, top: 60, h: 16, c: GRADE_COLORS.g5, code: 'DGI' },
    { day: 3, top: 60, h: 8, c: GRADE_COLORS.g5, code: 'ER' },
    { day: 3, top: 60, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 1 },
    { day: 4, top: 60, h: 8, c: GRADE_COLORS.g5, code: 'ER' },
    { day: 4, top: 60, h: 16, c: GRADE_COLORS.g5, code: 'DGI', off: 1 },
  ];

  return (
    <div
      style={{
        width,
        background: '#FFF',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow:
          '0 24px 60px -20px rgba(15,23,42,0.18), 0 8px 18px -8px rgba(15,23,42,0.08)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
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
            Main Schedule
          </div>
          <div style={{ fontSize: 18, color: '#0F172A', fontWeight: 700, marginTop: 2 }}>
            This week
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {GRADE_LIST.map((g) => (
            <span
              key={g.l}
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: '3px 7px',
                borderRadius: 999,
                background: g.c + '22',
                color: g.c,
              }}
            >
              {g.l}
            </span>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '44px repeat(5, 1fr)', position: 'relative' }}>
        <div></div>
        {days.map((d) => (
          <div
            key={d}
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
        {['8:00', '9:00', '10:00', '11:00'].map((t, i) => (
          <div
            key={t}
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
            key={di}
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
                  {s.conflict && (
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
                  )}
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
    </div>
  );
}

export function MockMinutesCard({ width = 420 }: { width?: string | number }) {
  const students = [
    { initials: 'AC', name: 'A. Chen', goal: 120, used: 118, c: GRADE_COLORS.g3 },
    { initials: 'MM', name: 'M. Mendez', goal: 90, used: 92, c: GRADE_COLORS.g4 },
    { initials: 'DG', name: 'D. Garza', goal: 180, used: 142, c: GRADE_COLORS.g5 },
    { initials: 'JW', name: 'J. Wilson', goal: 60, used: 60, c: GRADE_COLORS.g3 },
    { initials: 'ER', name: 'E. Rivera', goal: 90, used: 71, c: GRADE_COLORS.g5 },
  ];
  return (
    <div
      style={{
        width,
        background: '#FFF',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow:
          '0 24px 60px -20px rgba(15,23,42,0.18), 0 8px 18px -8px rgba(15,23,42,0.08)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
        <div style={{ fontSize: 13, color: 'rgba(15,23,42,0.55)', fontWeight: 500 }}>
          Service minutes · this month
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <div
            style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}
          >
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
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>
                    {s.name}
                  </span>
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
                    style={{
                      height: '100%',
                      width: `${pct}%`,
                      background: barColor,
                      borderRadius: 999,
                      transition: 'width .4s',
                    }}
                  ></div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MasterEvent = { d: number; t: number; h: number; col: number; k: string };

export function MockMasterScheduleCard({ width = 540 }: { width?: string | number }) {
  const ACT: Record<string, { name: string; c: string; bg: string }> = {
    garden: { name: 'Garden', c: '#22C55E', bg: '#DCFCE7' },
    library: { name: 'Library', c: '#3B82F6', bg: '#DBEAFE' },
    music: { name: 'Music', c: '#A78BFA', bg: '#EDE9FE' },
    steam: { name: 'STEAM', c: '#F97316', bg: '#FFEDD5' },
    recess: { name: 'Recess', c: '#F59E0B', bg: '#FEF3C7' },
    lunch: { name: 'Lunch', c: '#94A3B8', bg: '#E2E8F0' },
  };
  const events: MasterEvent[] = [
    { d: 0, t: 0, h: 6, col: 0, k: 'recess' },
    { d: 0, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 0, t: 0, h: 6, col: 2, k: 'recess' },
    { d: 0, t: 7, h: 12, col: 0, k: 'music' },
    { d: 0, t: 7, h: 12, col: 1, k: 'library' },
    { d: 0, t: 21, h: 14, col: 0, k: 'recess' },
    { d: 0, t: 21, h: 14, col: 1, k: 'recess' },
    { d: 0, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 0, t: 21, h: 14, col: 3, k: 'recess' },
    { d: 0, t: 38, h: 12, col: 0, k: 'library' },
    { d: 0, t: 38, h: 12, col: 1, k: 'music' },
    { d: 0, t: 52, h: 10, col: 0, k: 'lunch' },
    { d: 0, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 0, t: 64, h: 14, col: 0, k: 'music' },
    { d: 0, t: 64, h: 14, col: 1, k: 'library' },
    { d: 0, t: 80, h: 8, col: 0, k: 'recess' },
    { d: 0, t: 80, h: 8, col: 1, k: 'recess' },
    { d: 0, t: 80, h: 8, col: 2, k: 'recess' },
    { d: 1, t: 0, h: 6, col: 0, k: 'recess' },
    { d: 1, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 1, t: 7, h: 12, col: 0, k: 'garden' },
    { d: 1, t: 7, h: 12, col: 1, k: 'steam' },
    { d: 1, t: 21, h: 14, col: 0, k: 'recess' },
    { d: 1, t: 21, h: 14, col: 1, k: 'recess' },
    { d: 1, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 1, t: 38, h: 12, col: 0, k: 'steam' },
    { d: 1, t: 38, h: 12, col: 1, k: 'garden' },
    { d: 1, t: 52, h: 10, col: 0, k: 'lunch' },
    { d: 1, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 1, t: 64, h: 14, col: 0, k: 'library' },
    { d: 1, t: 64, h: 14, col: 1, k: 'music' },
    { d: 1, t: 80, h: 8, col: 0, k: 'recess' },
    { d: 2, t: 0, h: 6, col: 0, k: 'recess' },
    { d: 2, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 2, t: 7, h: 12, col: 0, k: 'steam' },
    { d: 2, t: 7, h: 12, col: 1, k: 'steam' },
    { d: 2, t: 21, h: 14, col: 0, k: 'recess' },
    { d: 2, t: 21, h: 14, col: 1, k: 'recess' },
    { d: 2, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 2, t: 38, h: 12, col: 0, k: 'garden' },
    { d: 2, t: 38, h: 12, col: 1, k: 'garden' },
    { d: 2, t: 52, h: 10, col: 0, k: 'lunch' },
    { d: 2, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 2, t: 64, h: 14, col: 0, k: 'music' },
    { d: 2, t: 64, h: 14, col: 1, k: 'music' },
    { d: 3, t: 0, h: 6, col: 0, k: 'recess' },
    { d: 3, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 3, t: 0, h: 6, col: 2, k: 'recess' },
    { d: 3, t: 7, h: 12, col: 0, k: 'music' },
    { d: 3, t: 7, h: 12, col: 1, k: 'steam' },
    { d: 3, t: 21, h: 14, col: 0, k: 'recess' },
    { d: 3, t: 21, h: 14, col: 1, k: 'recess' },
    { d: 3, t: 21, h: 14, col: 2, k: 'recess' },
    { d: 3, t: 38, h: 12, col: 0, k: 'library' },
    { d: 3, t: 38, h: 12, col: 1, k: 'steam' },
    { d: 3, t: 52, h: 10, col: 0, k: 'lunch' },
    { d: 3, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 3, t: 64, h: 14, col: 0, k: 'garden' },
    { d: 3, t: 64, h: 14, col: 1, k: 'library' },
    { d: 3, t: 80, h: 8, col: 0, k: 'recess' },
    { d: 3, t: 80, h: 8, col: 1, k: 'recess' },
    { d: 4, t: 0, h: 6, col: 0, k: 'recess' },
    { d: 4, t: 0, h: 6, col: 1, k: 'recess' },
    { d: 4, t: 7, h: 12, col: 0, k: 'library' },
    { d: 4, t: 38, h: 12, col: 0, k: 'music' },
    { d: 4, t: 38, h: 12, col: 1, k: 'library' },
    { d: 4, t: 21, h: 14, col: 0, k: 'recess' },
    { d: 4, t: 21, h: 14, col: 1, k: 'recess' },
    { d: 4, t: 52, h: 10, col: 0, k: 'lunch' },
    { d: 4, t: 52, h: 10, col: 1, k: 'lunch' },
    { d: 4, t: 64, h: 14, col: 0, k: 'steam' },
    { d: 4, t: 64, h: 14, col: 1, k: 'garden' },
  ];
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const zones = ['Basketball', 'Kinder Yard', 'Playstructure', 'Grass Area'];

  return (
    <div
      style={{
        width,
        background: '#FFF',
        borderRadius: 16,
        border: '1px solid rgba(15,23,42,0.08)',
        boxShadow:
          '0 24px 60px -20px rgba(15,23,42,0.18), 0 8px 18px -8px rgba(15,23,42,0.08)',
        overflow: 'hidden',
        fontFamily: 'inherit',
      }}
    >
      <div style={{ padding: '14px 18px 12px', borderBottom: '1px solid rgba(15,23,42,0.06)' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Master Schedule</div>
            <div style={{ fontSize: 11, color: 'rgba(15,23,42,0.55)', marginTop: 2 }}>
              School year 2025–2026
            </div>
          </div>
          <div
            style={{ display: 'flex', gap: 4, padding: 3, background: '#F3F5F8', borderRadius: 8 }}
          >
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
                <span
                  style={{ width: 6, height: 6, borderRadius: 999, background: v.c }}
                ></span>
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

      <div
        style={{ display: 'grid', gridTemplateColumns: '40px repeat(5, 1fr)', position: 'relative' }}
      >
        <div></div>
        {days.map((d) => (
          <div
            key={d}
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
            key={t}
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
            key={di}
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
    </div>
  );
}
