'use client';

/**
 * District Tech Admin portal home (SPE-393).
 *
 * The shell only: it establishes the route the role is pinned to and explains
 * what will live here. The actual connection surfaces arrive with SPE-396
 * (Aeries API) and SPE-397 (OneRoster); SPE-395 adds the credential store they
 * both write to.
 */

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardHeader, CardTitle, CardBody } from '../../../components/ui/card';

interface TechProfile {
  full_name: string | null;
  school_district: string | null;
}

export default function TechPortalPage() {
  const [profile, setProfile] = useState<TechProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const loadProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name, school_district')
        .eq('id', user.id)
        .single();

      setProfile(data);
    } catch (error) {
      console.error('Error loading tech portal profile:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Integrations</h1>
          <p className="mt-2 text-gray-600">
            Connect {profile?.school_district || 'your district'}&apos;s student
            information system to Speddy.
          </p>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>No connection yet</CardTitle>
            </CardHeader>
            <CardBody>
              <p className="text-sm text-gray-600">
                Your district doesn&apos;t have a student information system
                connected. Setup runs with help from the Speddy team — we&apos;ll
                walk you through it and confirm the connection works before
                anything syncs.
              </p>
              <p className="mt-4 text-sm text-gray-600">
                Setup can begin once your district&apos;s data privacy agreement
                is signed. Your Speddy contact will let you know when it&apos;s
                time.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What you&apos;ll need</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className="space-y-3 text-sm text-gray-600">
                <li>
                  <span className="font-medium text-gray-900">
                    Access to your SIS admin settings.
                  </span>{' '}
                  For Aeries that&apos;s the API Security page; for OneRoster
                  it&apos;s wherever your vendor issues API credentials.
                </li>
                <li>
                  <span className="font-medium text-gray-900">
                    Permission to create an API account.
                  </span>{' '}
                  Speddy only ever reads — we never write back to your SIS.
                </li>
                <li>
                  <span className="font-medium text-gray-900">
                    A few minutes to test the connection.
                  </span>{' '}
                  We check each piece separately and tell you in plain language
                  what&apos;s working and what isn&apos;t.
                </li>
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
