'use client';

import { Check, AlertTriangle, Minus } from 'lucide-react';
import type { ReviewSignal } from '@/lib/import/review-model';

/**
 * The single confidence vocabulary for the import review screen (SPE-227),
 * rendered identically everywhere it appears (receipt, exceptions, teacher
 * cells, goal removal): ✓ confident · ! check this · − removed/failed.
 */

const SIGNAL_META: Record<ReviewSignal, { Icon: typeof Check; tone: string; label: string }> = {
  confident: { Icon: Check, tone: 'text-green-600', label: 'Confident' },
  check: { Icon: AlertTriangle, tone: 'text-amber-600', label: 'Check this' },
  removed: { Icon: Minus, tone: 'text-gray-400', label: 'Removed' },
};

interface ReviewSignalIconProps {
  signal: ReviewSignal;
  className?: string;
  /** Hide from the accessibility tree when the surrounding text already conveys the meaning. */
  decorative?: boolean;
}

export function ReviewSignalIcon({ signal, className = '', decorative = false }: ReviewSignalIconProps) {
  const { Icon, tone, label } = SIGNAL_META[signal];
  return (
    <Icon
      className={`h-4 w-4 shrink-0 ${tone} ${className}`}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
    />
  );
}
