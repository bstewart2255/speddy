import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  /** Size/positioning utility classes (default `h-4 w-4`). */
  className?: string;
}

/**
 * The one spinner for the app (SPE-228) — a single lucide-based implementation
 * so the upload surfaces (and anywhere else) stop hand-rolling inline SVGs.
 * Decorative: pair it with adjacent text (e.g. "Importing…") that conveys state.
 */
export function Spinner({ className = 'h-4 w-4' }: SpinnerProps) {
  return <Loader2 className={`animate-spin ${className}`} aria-hidden="true" />;
}
