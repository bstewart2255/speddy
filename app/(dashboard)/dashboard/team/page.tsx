"use client";

import React, { useState, useEffect, useCallback } from "react";
import type { Database } from "../../../../src/types/database";
import { Card, CardBody } from "../../../components/ui/card";
import { createClient } from '@/lib/supabase/client';

interface SEAProfile {
  id: string;
  full_name: string;
  email: string;
  school_site: string;
  created_at: string;
  shared_at_school: boolean;
  supervising_provider_id: string | null;
}

export default function TeamPage() {
  const [seas, setSeas] = useState<SEAProfile[]>([]);
  const [sharedSeas, setSharedSeas] = useState<SEAProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("");
  const [userSchool, setUserSchool] = useState<{ school_district: string; school_site: string } | null>(null);
  const supabase = createClient<Database>();

  const fetchTeamData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get current user's role and school info
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, school_district, school_site')
        .eq('id', user.id)
        .single();

      if (profile) {
        setUserRole(profile.role);
        setUserSchool({ 
          school_district: profile.school_district || '', 
          school_site: profile.school_site || '' 
        });
      }

      // Only show SEA management for Resource Specialists
      if (profile?.role === 'resource') {
        // Get SEAs supervised by this Resource Specialist
        const { data: seasData, error: seasError } = await supabase
          .from('profiles')
          .select('id, full_name, email, school_site, created_at, shared_at_school, supervising_provider_id')
          .eq('supervising_provider_id', user.id)
          .eq('role', 'sea')
          .order('created_at', { ascending: false });

        if (seasError) throw seasError;
        setSeas(seasData || []);
        
        // Also get shared SEAs from the same school
        if (profile.school_district && profile.school_site) {
          const { data: sharedData, error: sharedError } = await supabase
            .from('profiles')
            .select('id, full_name, email, school_site, created_at, shared_at_school, supervising_provider_id')
            .eq('role', 'sea')
            .eq('shared_at_school', true)
            .eq('school_district', profile.school_district)
            .eq('school_site', profile.school_site)
            .neq('supervising_provider_id', user.id)
            .order('full_name', { ascending: true });
            
          if (sharedError) throw sharedError;
          setSharedSeas(sharedData || []);
        }
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchTeamData();
  }, [fetchTeamData]);

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

  const toggleSharingStatus = async (seaId: string, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      const action = newStatus ? 'share' : 'unshare';
      
      if (!confirm(`Are you sure you want to ${action} this SEA with other Resource Specialists at your school?`)) {
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({ shared_at_school: newStatus })
        .eq('id', seaId);

      if (error) throw error;

      // Refresh the data
      fetchTeamData();
      alert(`SEA ${newStatus ? 'shared' : 'unshared'} successfully.`);
    } catch (error) {
      console.error('Error toggling sharing status:', error);
      alert('Failed to update sharing status.');
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
          <div className="space-y-6">
            {/* My SEAs Section */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-medium text-gray-900">
                  My Special Education Assistants ({seas.length})
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
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{sea.full_name}</h3>
                          {sea.shared_at_school && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                              Shared at School
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{sea.email}</p>
                        <p className="text-sm text-gray-500">{sea.school_site}</p>
                        <p className="text-xs text-gray-400">
                          Joined: {new Date(sea.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => toggleSharingStatus(sea.id, sea.shared_at_school)}
                          className={`px-3 py-1 text-sm border rounded hover:opacity-80 ${
                            sea.shared_at_school
                              ? 'text-orange-600 border-orange-300 hover:bg-orange-50'
                              : 'text-blue-600 border-blue-300 hover:bg-blue-50'
                          }`}
                        >
                          {sea.shared_at_school ? 'Unshare' : 'Share at School'}
                        </button>
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

            {/* Shared SEAs Section */}
            {sharedSeas.length > 0 && (
              <div className="space-y-4 border-t pt-6">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-medium text-gray-900">
                    Shared SEAs at My School ({sharedSeas.length})
                  </h2>
                  <span className="text-sm text-gray-500">
                    Available from other Resource Specialists
                  </span>
                </div>
                <div className="space-y-3">
                  {sharedSeas.map((sea) => (
                    <div
                      key={sea.id}
                      className="flex items-center justify-between p-4 border border-gray-200 rounded-lg bg-gray-50"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-gray-900">{sea.full_name}</h3>
                          <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                            Shared SEA
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{sea.email}</p>
                        <p className="text-sm text-gray-500">{sea.school_site}</p>
                        <p className="text-xs text-gray-400">
                          You can assign sessions to this SEA
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}