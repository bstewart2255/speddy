import Stripe from 'stripe';

// Initialize Stripe with the secret key
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Price ID for the monthly subscription
export const MONTHLY_PRICE_ID = process.env.NEXT_PUBLIC_STRIPE_MONTHLY_PRICE_ID!;

// Subscription configuration
export const SUBSCRIPTION_CONFIG = {
  monthlyPrice: 11.99,
  currency: 'usd',
  trialPeriodDays: 30,
  extendedTrialPeriodDays: 60,
  referralCreditAmount: 1.00,
  pauseableMonths: [6, 7], // June and July
};

// Helper function to calculate trial end date
export function calculateTrialEndDate(hasReferralCode: boolean): Date {
  const trialDays = hasReferralCode 
    ? SUBSCRIPTION_CONFIG.extendedTrialPeriodDays 
    : SUBSCRIPTION_CONFIG.trialPeriodDays;
  
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + trialDays);
  return trialEnd;
}

// Helper function to check if current month is pauseable
export function isCurrentMonthPauseable(): boolean {
  const currentMonth = new Date().getMonth() + 1; // getMonth() returns 0-11
  return SUBSCRIPTION_CONFIG.pauseableMonths.includes(currentMonth);
}

// Helper function to format price for display
export function formatPrice(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: SUBSCRIPTION_CONFIG.currency,
  }).format(amount);
}