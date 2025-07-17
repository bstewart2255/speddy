# Referral Credits Table Information

## Table Structure

The `referral_credits` table tracks monthly referral credit calculations for users. It has the following structure:

```sql
CREATE TABLE public.referral_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    total_credits DECIMAL(10, 2) DEFAULT 0.00,
    credits_applied DECIMAL(10, 2) DEFAULT 0.00,
    payout_amount DECIMAL(10, 2) DEFAULT 0.00,
    status TEXT NOT NULL CHECK (status IN ('pending', 'applied', 'paid_out')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(user_id, month)
);
```

## Key Points

1. **Credits are stored in dollars**, not cents (e.g., 5.00 means $5.00)
2. **One record per user per month** (enforced by unique constraint)
3. **RLS is enabled** - users can only see their own credits

## How Credits Work

1. When a user refers someone who subscribes, a monthly credit is calculated
2. Credits are typically $1.00 per active referral per month
3. The system should create/update a record in this table each month
4. Credits can have different statuses:
   - `pending`: Credit calculated but not yet applied
   - `applied`: Credit has been applied to reduce the user's bill
   - `paid_out`: Credit has been paid out (if applicable)

## Current Implementation Status

The referral credits system appears to be partially implemented:
- Table exists with proper structure
- RLS policies are in place
- Components can read from the table
- **Missing**: Automated job to calculate and insert monthly credits

## Component Usage

The referral components (`ReferralCodeDisplay` and `ReferralSummary`) expect:
- `total_credits`: The dollar amount of credits for that month
- Records are filtered by month for current month's credits
- Total credits are summed across all months

## Testing

Since the automated credit calculation might not be implemented yet, you can manually insert test data:

```sql
-- Insert test credit for a user (replace user_id)
INSERT INTO public.referral_credits (
    user_id, 
    month, 
    total_credits, 
    status
) VALUES (
    'your-user-id-here',
    DATE_TRUNC('month', CURRENT_DATE),
    5.00,  -- $5.00 credit
    'pending'
);
```

## Next Steps

To fully implement the referral credits system:
1. Create a scheduled job (cron/Edge Function) to calculate monthly credits
2. Count active referrals for each user
3. Insert/update referral_credits records monthly
4. Integrate with billing system to apply credits