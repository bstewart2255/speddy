-- Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    stripe_customer_id TEXT NOT NULL,
    stripe_subscription_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'paused', 'trialing')),
    current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
    current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    trial_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create referral_codes table
CREATE TABLE IF NOT EXISTS public.referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    code TEXT UNIQUE NOT NULL,
    uses_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Create referral_relationships table
CREATE TABLE IF NOT EXISTS public.referral_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    referred_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('trial', 'active', 'canceled', 'paused')),
    credit_amount DECIMAL(10, 2) DEFAULT 1.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(referrer_id, referred_id)
);

-- Create subscription_pauses table
CREATE TABLE IF NOT EXISTS public.subscription_pauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    pause_start DATE NOT NULL,
    pause_end DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT valid_pause_months CHECK (
        EXTRACT(MONTH FROM pause_start) IN (6, 7) AND
        EXTRACT(MONTH FROM pause_end) IN (6, 7)
    )
);

-- Create referral_credits table for tracking monthly credits
CREATE TABLE IF NOT EXISTS public.referral_credits (
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

-- Create indexes
CREATE INDEX idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON public.subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX idx_referral_codes_user_id ON public.referral_codes(user_id);
CREATE INDEX idx_referral_relationships_referrer_id ON public.referral_relationships(referrer_id);
CREATE INDEX idx_referral_relationships_referred_id ON public.referral_relationships(referred_id);
CREATE INDEX idx_referral_relationships_status ON public.referral_relationships(status);
CREATE INDEX idx_subscription_pauses_subscription_id ON public.subscription_pauses(subscription_id);
CREATE INDEX idx_referral_credits_user_id_month ON public.referral_credits(user_id, month);

-- Create functions for updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_relationships_updated_at BEFORE UPDATE ON public.referral_relationships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_referral_credits_updated_at BEFORE UPDATE ON public.referral_credits
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to generate referral codes
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    -- Generate a 6-character code
    FOR i IN 1..6 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Create function to ensure referral code exists for new users
CREATE OR REPLACE FUNCTION ensure_referral_code()
RETURNS TRIGGER AS $$
DECLARE
    new_code TEXT;
    attempts INTEGER := 0;
BEGIN
    -- Try to generate a unique code
    LOOP
        new_code := generate_referral_code();
        
        -- Check if code already exists
        IF NOT EXISTS (SELECT 1 FROM public.referral_codes WHERE code = new_code) THEN
            -- Insert the new code
            INSERT INTO public.referral_codes (user_id, code)
            VALUES (NEW.id, new_code);
            EXIT; -- Exit the loop
        END IF;
        
        attempts := attempts + 1;
        
        -- Prevent infinite loop
        IF attempts > 100 THEN
            RAISE EXCEPTION 'Unable to generate unique referral code';
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to generate referral code for new profiles
CREATE TRIGGER generate_referral_code_for_new_user
    AFTER INSERT ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION ensure_referral_code();

-- RLS Policies
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_pauses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_credits ENABLE ROW LEVEL SECURITY;

-- Subscriptions policies
CREATE POLICY "Users can view their own subscriptions" ON public.subscriptions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions" ON public.subscriptions
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Referral codes policies
CREATE POLICY "Users can view their own referral code" ON public.referral_codes
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Anyone can check if a referral code exists" ON public.referral_codes
    FOR SELECT USING (true);

-- Referral relationships policies
CREATE POLICY "Users can view relationships where they are referrer or referred" ON public.referral_relationships
    FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

CREATE POLICY "Service role can manage all referral relationships" ON public.referral_relationships
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Subscription pauses policies
CREATE POLICY "Users can view their own subscription pauses" ON public.subscription_pauses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.subscriptions
            WHERE subscriptions.id = subscription_pauses.subscription_id
            AND subscriptions.user_id = auth.uid()
        )
    );

CREATE POLICY "Service role can manage all subscription pauses" ON public.subscription_pauses
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');

-- Referral credits policies
CREATE POLICY "Users can view their own referral credits" ON public.referral_credits
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all referral credits" ON public.referral_credits
    FOR ALL USING (auth.jwt()->>'role' = 'service_role');
