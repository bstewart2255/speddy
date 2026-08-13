import { NextResponse } from 'next/server';
import { isAiEnabled, withRoute } from '@/lib/api/with-route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Which flag-gated features are available right now (SPE-494). Client surfaces
 * embedded in always-reachable UI (e.g. the accommodations PDF import inside
 * the student-details modal) ask this instead of rendering a dead entry point —
 * every other AI surface is simply unreachable while the kill switch is off
 * (the Tools page is not linked in any role's nav).
 *
 * Deliberately NOT aiGated: this route must answer while the switch is off.
 * The flag is read per request via the same helper the route gate uses, so
 * flipping AI_FEATURES_ENABLED shows/hides the UI on the next load with no
 * redeploy. Exposes only booleans — never configuration detail.
 */
export const GET = withRoute({}, async () => {
  return NextResponse.json({
    aiFeatures: isAiEnabled(),
  });
});
