# Payment System Setup Guide

This guide covers the setup and configuration of the Speddy payment system using Stripe.

## Overview

The payment system includes:
- Monthly subscription ($11.99/month)
- 30-day free trial (60 days with referral code)
- Referral program ($1 credit per active referral)
- Summer pause option (June/July only)
- Automatic referral credit calculation

## Prerequisites

1. Stripe account with test/production API keys
2. Stripe webhook endpoint configured
3. Environment variables set in Replit

## Environment Variables

Add these to your Replit Secrets:

```bash
# Stripe Keys
STRIPE_SECRET_KEY=sk_test_... or sk_live_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_... or pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Stripe Price ID (create in Stripe Dashboard)
STRIPE_MONTHLY_PRICE_ID=price_...

# App URL (for redirects)
NEXT_PUBLIC_APP_URL=https://your-app.replit.app

# Supabase Service Role Key (for webhooks)
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Stripe Setup

1. **Create a Product in Stripe Dashboard**
   - Name: "Speddy Monthly Subscription"
   - Price: $11.99/month
   - Save the price ID for `STRIPE_MONTHLY_PRICE_ID`

2. **Configure Webhook Endpoint**
   - URL: `https://your-app.replit.app/api/stripe/webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Save the webhook secret for `STRIPE_WEBHOOK_SECRET`

3. **Configure Customer Portal**
   - Enable in Stripe Dashboard under Settings → Billing → Customer Portal
   - Allow customers to:
     - Update payment methods
     - View invoices
     - Cancel subscriptions

## Database Setup

Run the migration files in order:

1. `20250710_payment_system.sql` - Creates all payment-related tables
2. `20250710_increment_function.sql` - Creates helper function for referral tracking

```bash
# In Supabase SQL Editor, run each migration file
```

## Testing

### Test Signup Flow
1. Create a new account
2. After email verification, user is prompted to subscribe
3. Use Stripe test card: `4242 4242 4242 4242`
4. Verify subscription is created in database

### Test Referral System
1. Get referral code from user's billing page
2. Sign up new account with referral code
3. Verify 60-day trial is applied
4. After trial ends, verify $1 credit is applied to referrer

### Test Summer Pause
1. During June or July, go to billing page
2. Click "Pause for Summer"
3. Select end date (must be in June/July)
4. Verify subscription is paused in Stripe

### Test Cards
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires auth: `4000 0027 6000 3184`

## Payment Flow

1. **Signup**: User creates account → Email verification → Payment prompt
2. **Trial Period**: 30 days default, 60 days with referral code
3. **Subscription Start**: After trial, monthly billing begins
4. **Referral Credits**: Calculated monthly, applied to invoice
5. **Summer Pause**: User-initiated, only in June/July

## Monitoring

Check these regularly:
- Stripe Dashboard for payment issues
- Supabase logs for webhook errors
- `subscriptions` table for status
- `referral_credits` table for credit calculations

## Troubleshooting

### Webhook Not Firing
- Check webhook URL in Stripe
- Verify webhook secret is correct
- Check Replit logs for errors

### Subscription Not Created
- Check Supabase RLS policies
- Verify service role key is set
- Check webhook handler logs

### Referral Credits Not Applied
- Verify referral relationship exists
- Check subscription status is 'active'
- Verify credit calculation runs on invoice payment

## Production Checklist

- [ ] Replace test API keys with live keys
- [ ] Update webhook endpoint to production URL
- [ ] Test full payment flow with real card
- [ ] Monitor first few subscriptions closely
- [ ] Set up Stripe email notifications
- [ ] Configure Stripe tax settings if needed
