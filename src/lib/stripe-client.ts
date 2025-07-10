import { loadStripe, Stripe } from '@stripe/stripe-js';

// Singleton instance of Stripe
let stripePromise: Promise<Stripe | null>;

// Get or create the Stripe instance
export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
}