"use client";

import React, { useState, useEffect } from "react";
import type { Database } from "../../../../src/types/database";
import { Card, CardBody } from "../../../components/ui/card";
import { createClient } from '@/lib/supabase/client';

interface SEAProfile {
  id: string;
  full_name: string;
  email: string;
  school_site: string;
  created_at: string;
}

export default function TeamPage() {
  const [seas, setSeas] = useState<SEAProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const supabase = createClient<Database>();

  useEffect(() => {
    fetchTeamData();
  }, []);

  const fetchTeamData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current user's role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
      }

      // Only show SEA management for Resource Specialists
      if (profile?.role === 'resource') {
        // Get SEAs supervised by this Resource Specialist
        const { data: seasData, error } = await supabase
          .from('profiles')
          .select('id, full_name, email, school_site, created_at')
          .eq('supervising_provider_id', user.id)
          .eq('role', 'sea')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setSeas(seasData || []);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSEA = async (seaId: string) => {
    if (!confirm('Are you sure you want to remove this SEA from your team? This will unassign them from all sessions.')) {
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Remove SEA assignments from all sessions
      await supabase
        .from('schedule_sessions')
        .update({ 
          assigned_to_sea_id: null,
          delivered_by: 'provider'
        })
        .eq('provider_id', user.id)
        .eq('assigned_to_sea_id', seaId);

      // Remove supervising relationship
      await supabase
        .from('profiles')
        .update({ supervising_provider_id: null })
        .eq('id', seaId);

      // Refresh the data
      fetchTeamData();
      alert('SEA removed from your team successfully.');
    } catch (error) {
      console.error('Error removing SEA:', error);
      alert('Failed to remove SEA from team.');
    }
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  if (userRole !== 'resource') {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          This page is only available to Resource Specialists.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Team Management</h1>
        <p className="text-gray-600">Manage your Special Education Assistants</p>
      </div>

      <Card>
        <CardBody>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-gray-900">
                Special Education Assistants ({seas.length})
              </h2>
            </div>

            {seas.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No SEAs are currently assigned to your team.</p>
                <p className="text-sm mt-2">
                  SEAs can join your team by signing up with your email address as their supervising provider.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {seas.map((sea) => (
                  <div
                    key={sea.id}
                    className="flex items-center justify-between p-4 border border-gray-200 rounded-lg"
                  >
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{sea.full_name}</h3>
                      <p className="text-sm text-gray-600">{sea.email}</p>
                      <p className="text-sm text-gray-500">{sea.school_site}</p>
                      <p className="text-xs text-gray-400">
                        Joined: {new Date(sea.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRemoveSEA(sea.id)}
                        className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}