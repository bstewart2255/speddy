'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card } from '@/app/components/ui/card';
import { Button } from '@/app/components/ui/button';
import { Copy, Share2, Users, DollarSign, TrendingUp, Gift } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/app/components/providers/auth-provider';

interface ReferralStats {
  code: string;
  uses_count: number;
  active_referrals: number;
  total_credits: number;
  monthly_credits: number;
}

export function ReferralCodeDisplay() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const fetchReferralStats = useCallback(async () => {
    try {
      const supabase = createClient();
      
      // Fetch referral code
      const { data: codeData, error: codeError } = await supabase
        .from('referral_codes')
        .select('code, uses_count')
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

      // Fetch active referrals - simplified query
      const { data: referralsData, error: referralsError } = await supabase
        .from('referral_relationships')
        .select('*')
        .eq('referrer_id', user!.id);

      if (referralsError) {
        console.error('Error fetching referral relationships:', referralsError);
        throw referralsError;
      }

      // Fetch referral credits
      const { data: creditsData, error: creditsError } = await supabase
        .from('referral_credits')
        .select('total_credits')
        .eq('user_id', user!.id);

      if (creditsError) {
        console.error('Error fetching referral credits:', creditsError);
        // Don't throw - just use 0 credits if we can't fetch
        console.log('Using 0 for total credits due to error');
      }

      // Calculate total credits (already in dollars, not cents)
      const totalCredits = creditsData?.reduce((sum, credit) => sum + Number(credit.total_credits), 0) || 0;

      // Get current month's credits
      const currentMonth = new Date();
      currentMonth.setDate(1);
      currentMonth.setHours(0, 0, 0, 0);

      const { data: monthlyCreditsData } = await supabase
        .from('referral_credits')
        .select('total_credits')
        .eq('user_id', user!.id)
        .gte('month', currentMonth.toISOString());

      const monthlyCredits = monthlyCreditsData?.reduce((sum, credit) => sum + Number(credit.total_credits), 0) || 0;

      setStats({
        code: codeData.code,
        uses_count: codeData.uses_count,
        active_referrals: referralsData?.length || 0,
        total_credits: totalCredits, // Already in dollars
        monthly_credits: monthlyCredits, // Already in dollars
      });
    } catch (error: any) {
      console.error('Error fetching referral stats:', {
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
      fetchReferralStats();
    }
  }, [user, fetchReferralStats]);

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

  const handleCopyLink = async () => {
    if (!stats?.code) return;
    
    const referralLink = `${window.location.origin}/signup?referral=${stats.code}`;
    
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleShare = async () => {
    if (!stats?.code) return;
    
    const referralLink = `${window.location.origin}/signup?referral=${stats.code}`;
    const shareText = `Join Speddy with my referral code ${stats.code} and get 60 days free! Sign up here: ${referralLink}`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join Speddy - Special Education Tools',
          text: shareText,
          url: referralLink,
        });
      } catch (error) {
        console.error('Error sharing:', error);
      }
    } else {
      // Fallback to copying the share text
      await navigator.clipboard.writeText(shareText);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  if (loading) {
    return (
      <Card shadow="md" padding="lg">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-full"></div>
        </div>
      </Card>
    );
  }

  if (!stats?.code) {
    return null;
  }

  return (
    <Card shadow="md" padding="none" className="overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-xl font-bold text-blue-900">
            <Gift className="w-5 h-5" />
            Your Referral Program
          </h3>
          <div className="text-sm text-blue-700 font-medium">
            Earn $1/month per referral
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-6 space-y-6">
        {/* Referral Code Display */}
        <div className="text-center">
          <p className="text-sm text-gray-600 mb-2">Your referral code</p>
          <div className="relative inline-flex items-center gap-3 bg-gray-50 px-6 py-3 rounded-lg border-2 border-dashed border-gray-300">
            <span className="text-2xl font-mono font-bold text-gray-900 tracking-wider">
              {stats.code}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyCode}
              className="!p-2"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </Button>
            {copied && (
              <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-sm text-green-600 font-medium">
                Copied!
              </span>
            )}
          </div>
        </div>

        {/* Share Actions */}
        <div className="flex gap-3 justify-center">
          <Button
            variant="secondary"
            size="sm"
            leftIcon={<Copy className="w-4 h-4" />}
            onClick={handleCopyLink}
          >
            {copiedLink ? 'Link Copied!' : 'Copy Signup Link'}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Share2 className="w-4 h-4" />}
            onClick={handleShare}
          >
            Share
          </Button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-700 mb-1">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Total Uses</span>
            </div>
            <p className="text-2xl font-bold text-blue-900">{stats.uses_count}</p>
          </div>

          <div className="bg-green-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-700 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm font-medium">Active Referrals</span>
            </div>
            <p className="text-2xl font-bold text-green-900">{stats.active_referrals}</p>
          </div>

          <div className="bg-purple-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-700 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm font-medium">This Month</span>
            </div>
            <p className="text-2xl font-bold text-purple-900">${stats.monthly_credits}</p>
          </div>

          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="flex items-center gap-2 text-indigo-700 mb-1">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm font-medium">Total Earned</span>
            </div>
            <p className="text-2xl font-bold text-indigo-900">${stats.total_credits}</p>
          </div>
        </div>

        {/* Info Text */}
        <div className="text-center text-sm text-gray-600 space-y-1">
          <p>Friends who use your code get <strong>60 days free</strong> (instead of 30)</p>
          <p>You earn <strong>$1 off per month</strong> for each active referral</p>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 border-t px-6 py-4">
        <div className="text-xs text-gray-500 text-center">
          Share your code with other special education professionals in your district
        </div>
      </div>
    </Card>
  );
}