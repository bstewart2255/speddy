'use client';

/**
 * District Tech Admin portal (SPE-393 shell, SPE-396 Aeries flow).
 *
 * The connection row is read straight from Supabase rather than through an API
 * route: `district_sis_connections` grants a district's own tech/district admin
 * SELECT on exactly the non-secret columns (SPE-395), so this read is governed
 * by the same policy that protects the credentials.
 *
 * Columns are named explicitly and MUST stay that way. `select('*')` on this
 * table is REFUSED for a browser session — `*` expands to columns the grant
 * excludes, and PostgREST returns 42501 rather than a narrowed row. That is
 * deliberate: a loud error beats silently shipping a certificate because
 * someone reached for the usual shorthand.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BROWSER_CONNECTION_COLUMNS } from '@/lib/sis/connection-columns';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';
import AeriesSetupGuide from '../../../components/tech/aeries-setup-guide';
import AeriesConnectionCard, {
  type ConnectionSummary,
} from '../../../components/tech/aeries-connection-card';
import OneRosterSetupGuide from '../../../components/tech/oneroster-setup-guide';
import OneRosterConnectionCard from '../../../components/tech/oneroster-connection-card';

// Shared with scripts/sim-district/verify-sis-connections-rls.ts, so the
// verification cannot silently check a different column list than the one this
// page actually sends.
const CONNECTION_COLUMNS = BROWSER_CONNECTION_COLUMNS;

interface TechProfile {
  full_name: string | null;
  school_district: string | null;
}

export default function TechPortalPage() {
  const [profile, setProfile] = useState<TechProfile | null>(null);
  const [connections, setConnections] = useState<ConnectionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const supabase = createClient();

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prof }, { data: conns, error: connError }] = await Promise.all([
        supabase.from('profiles').select('full_name, school_district').eq('id', user.id).single(),
        supabase
          .from('district_sis_connections')
          .select(CONNECTION_COLUMNS)
          .order('sis_type'),
      ]);

      setProfile(prof);
      if (connError) {
        // Surfaced rather than swallowed: if the column grant ever drifts, this
        // is where it shows up, and a silent empty state would look identical
        // to "no connection set up yet".
        setLoadError('Could not load your integration status. Please refresh.');
        console.error('Failed to load SIS connections:', connError.message);
      } else {
        setConnections((conns ?? []) as unknown as ConnectionSummary[]);
      }
    } catch (error) {
      console.error('Error loading tech portal:', error);
      setLoadError('Could not load your integration status. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading integrations...</p>
        </div>
      </div>
    );
  }

  const aeries = connections.find((c) => c.sis_type === 'aeries');
  const oneroster = connections.find((c) => c.sis_type === 'oneroster');
  const districtName = profile?.school_district || 'your district';

  /**
   * The DPA gate, shared by both connectors. Nothing the district can do about
   * it from here, so the copy says who moves it forward instead of offering a
   * dead control.
   */
  const dpaGate = (product: string) => (
    <Card>
      <CardHeader>
        <CardTitle>Waiting on your data privacy agreement</CardTitle>
      </CardHeader>
      <CardBody>
        <p className="text-sm text-gray-600">
          Before {districtName} can share student data with Speddy, your signed data privacy
          agreement needs to be on file. Your Speddy contact is handling that — they&apos;ll let
          you know as soon as this page opens up.
        </p>
        <p className="mt-4 text-sm text-gray-600">
          Nothing is needed from you yet. If you want to get a head start, you can ask whoever
          manages your {product} settings to be ready.
        </p>
      </CardBody>
    </Card>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-2 text-gray-600">
            Connect {districtName}&apos;s student information system to Speddy.
          </p>
        </div>

        {loadError && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {loadError}
          </div>
        )}

        <div className="space-y-6">
          {!aeries && !oneroster && (
            <Card>
              <CardHeader>
                <CardTitle>No connection yet</CardTitle>
              </CardHeader>
              <CardBody>
                <p className="text-sm text-gray-600">
                  Your district doesn&apos;t have a student information system connected yet.
                  Setup runs with help from the Speddy team — we&apos;ll walk you through it and
                  confirm the connection works before anything syncs.
                </p>
                <p className="mt-4 text-sm text-gray-600">
                  Setup can begin once your district&apos;s data privacy agreement is signed. Your
                  Speddy contact will let you know when it&apos;s time.
                </p>
              </CardBody>
            </Card>
          )}

          {aeries &&
            (!aeries.dpa_cleared_at ? (
              dpaGate('Aeries security')
            ) : (
              <>
                <AeriesConnectionCard connection={aeries} onChanged={load} />
                <AeriesSetupGuide />
              </>
            ))}

          {oneroster &&
            (!oneroster.dpa_cleared_at ? (
              dpaGate('Aeries security')
            ) : (
              <>
                {/*
                  The limitation, stated where the work happens rather than
                  buried in a FAQ. A district can complete this whole setup
                  correctly and still not see the thing Speddy is for, and
                  finding that out afterwards is how trust gets spent.
                */}
                <div className="rounded-md border border-blue-200 bg-blue-50 p-4">
                  <p className="text-sm font-medium text-blue-900">
                    What OneRoster can and can&apos;t give us
                  </p>
                  <p className="mt-1 text-sm text-blue-800">
                    OneRoster shares your students, staff, schools and class rosters. It does not
                    carry special education information — there is no IEP flag, no program
                    membership and no eligibility date anywhere in the standard. That isn&apos;t a
                    setting we can ask you to turn on; it simply isn&apos;t part of OneRoster.
                  </p>
                  <p className="mt-2 text-sm text-blue-800">
                    So your team will still identify their own caseloads in Speddy. This
                    connection saves them from typing student and teacher names, and keeps those
                    lists current. If you want Speddy to see special education records directly,
                    that needs the Aeries connection instead — your Speddy contact can set it up.
                  </p>
                </div>
                <OneRosterConnectionCard connection={oneroster} onChanged={load} />
                <OneRosterSetupGuide />
              </>
            ))}

          <Card>
            <CardHeader>
              <CardTitle>What Speddy does with this access</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-3 text-sm text-gray-600">
                <li>
                  <span className="font-medium text-gray-900">Read-only, always.</span> Speddy
                  never writes anything back to your student information system.
                </li>
                <li>
                  <span className="font-medium text-gray-900">
                    Whatever you paste in is encrypted and never shown again.
                  </span>{' '}
                  Not to us in a support screen, and not back to you here — only its last four
                  characters.
                </li>
                <li>
                  <span className="font-medium text-gray-900">
                    We check each piece separately.
                  </span>{' '}
                  If something isn&apos;t granted, we tell you exactly which box to tick in
                  Aeries rather than just saying it failed.
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
