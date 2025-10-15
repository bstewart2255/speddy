'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Copy, ChevronDown, ChevronUp, Gift, DollarSign } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/components/providers/auth-provider';
import { ReferralCodeDisplay } from './referral-code-display';

interface ReferralSummaryStats {
  code: string;
  monthly_credits: number;
  active_referrals: number;
}

export function ReferralSummary() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralSummaryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const fetchReferralSummary = useCallback(async () => {
    try {
      const supabase = createClient();
      
      // Fetch referral code
      const { data: codeData, error: codeError } = await supabase
        .from('referral_codes')
        .select('code')
        .eq('user_id', user!.id)
        .single();

      if (codeError) {
        // If no referral code exists (PGRST116 = no rows returned), that's okay
        if (codeError.code === 'PGRST116') {
          console.log('No referral code found for user - user might be SEA or code not generated yet');
          return;
        }
        console.error('Error fetching referral code:', codeError);
        throw codeError;
      }

      // Fetch active referrals count - simplified query
      const { data: referralsData, error: referralsError } = await supabase
        .from('referral_relationships')
        .select('*')
        .eq('referrer_id', user!.id);

      if (referralsError) {
        console.error('Error fetching referral relationships:', referralsError);
        throw referralsError;
      }

      // Get current month's credits
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const { data: monthlyCreditsData, error: creditsError } = await supabase
        .from('referral_credits')
        .select('total_credits')
        .eq('user_id', user!.id)
        .gte('month', currentMonth.toISOString());

      if (creditsError) {
        console.error('Error fetching monthly credits:', creditsError);
        // Don't throw - just use 0 if we can't fetch
      }

      const monthlyCredits = monthlyCreditsData?.reduce((sum, credit) => sum + Number(credit.total_credits), 0) || 0;

      setStats({
        code: codeData.code,
        monthly_credits: monthlyCredits, // Already in dollars
        active_referrals: referralsData?.length || 0,
      });
    } catch (error: any) {
      console.error('Error fetching referral summary:', {
        error,
        message: error?.message,
        details: error?.details,
        code: error?.code,
        userId: user?.id
      });
      // Don't set stats, which will show nothing to the user
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchReferralSummary();
    }
  }, [user, fetchReferralSummary]);

  const handleCopyCode = async () => {
    if (!stats?.code) return;
    
    try {
      await navigator.clipboard.writeText(stats.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  if (loading) {
    return (
      <Card shadow="sm" padding="md">
        <div className="animate-pulse flex items-center justify-between">
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2"></div>
            <div className="h-6 bg-gray-200 rounded w-1/2"></div>
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded"></div>
        </div>
      </Card>
    );
  }

  if (!stats?.code) {
    return null;
  }

  // If expanded, show the full component
  if (expanded) {
    return (
      <div className="space-y-3">
        <ReferralCodeDisplay />
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(false)}
            leftIcon={<ChevronUp className="w-4 h-4" />}
          >
            Show less
          </Button>
        </div>
      </div>
    );
  }

  // Compact summary view
  return (
    <Card shadow="sm" padding="md" className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <Gift className="w-8 h-8 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <p className="text-sm font-medium text-gray-700">Your referral code:</p>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-lg text-gray-900">{stats.code}</span>
                <button
                  onClick={handleCopyCode}
                  className="text-gray-500 hover:text-gray-700 transition-colors"
                  title="Copy code"
                >
                  <Copy className="w-4 h-4" />
                </button>
                {copied && (
                  <span className="text-xs text-green-600 font-medium">Copied!</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-gray-600">
                <strong className="text-gray-900">{stats.active_referrals}</strong> active referral{stats.active_referrals !== 1 ? 's' : ''}
              </span>
              {stats.monthly_credits > 0 && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="flex items-center gap-1 text-green-700">
                    <DollarSign className="w-3 h-3" />
                    <strong>{stats.monthly_credits}</strong> off this month
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setExpanded(true)}
          rightIcon={<ChevronDown className="w-4 h-4" />}
        >
          View details
        </Button>
      </div>
    </Card>
  );
}