# Referral Code Testing Documentation

This document outlines the comprehensive testing strategy for the referral code system, including automated tests, manual testing procedures, and verification steps.

## Overview

The referral code system automatically generates unique 6-character alphanumeric codes for teacher users upon signup. SEA (Special Education Assistant) users do not receive referral codes as they have free access to the platform.

## Automated Test Coverage

### Integration Tests (`__tests__/integration/referral-codes.test.ts`)

#### 1. Teacher Role Code Generation
- **Test**: Resource teachers automatically get referral codes
- **Test**: Speech therapists automatically get referral codes
- **Test**: All teacher roles (resource, speech, ot, counseling, specialist) get codes
- **Verification**: Code exists in `referral_codes` table after profile creation

#### 2. SEA Role Exclusion
- **Test**: SEA users do NOT get referral codes
- **Verification**: No entry in `referral_codes` table for SEA users

#### 3. Code Uniqueness
- **Test**: Generate 10+ codes and verify no duplicates
- **Verification**: All codes are unique in the database

#### 4. Code Format Validation
- **Test**: All codes are exactly 6 characters
- **Test**: Only uppercase letters and numbers (excluding O, 0, I, 1)
- **Pattern**: `/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/`

#### 5. API Validation Endpoint
- **Test**: Valid codes return `{ valid: true, referrer_id: "..." }`
- **Test**: Invalid codes return `{ valid: false }`
- **Test**: Lowercase input is automatically converted to uppercase
- **Test**: Empty codes return 400 error

### E2E Tests (`tests/e2e/user-flows/referral-code-display.test.ts`)

#### 1. Dashboard Display
- **Test**: Teachers see referral code summary on dashboard
- **Test**: SEA users don't see referral code on their dashboard
- **Test**: "View details" button expands to show full statistics

#### 2. Copy Functionality
- **Test**: Copy code button works correctly
- **Test**: Visual feedback ("Copied!") appears
- **Test**: Clipboard contains the correct code

#### 3. Billing Page Display
- **Test**: Referral code appears on billing page for teachers
- **Test**: Code format is correct and matches dashboard display

## Manual Testing Checklist

### 1. New User Signup Flow

#### Teacher Signup:
- [ ] Sign up with a teacher role (resource/speech/ot/counseling/specialist)
- [ ] Verify email and complete onboarding
- [ ] Check dashboard - referral code should be visible
- [ ] Check database - `referral_codes` table should have entry
- [ ] Code should be 6 characters, uppercase alphanumeric

#### SEA Signup:
- [ ] Sign up with SEA role
- [ ] Verify email and complete onboarding
- [ ] Check dashboard - NO referral code should be visible
- [ ] Check database - NO entry in `referral_codes` table
- [ ] Verify redirect to SEA-specific dashboard

### 2. Referral Code Display Testing

#### Dashboard Display:
- [ ] Compact summary shows code, active referrals, monthly savings
- [ ] Copy button works and shows confirmation
- [ ] "View details" expands to full component
- [ ] Full component shows:
  - [ ] Total uses count
  - [ ] Active referrals count
  - [ ] Monthly credits earned
  - [ ] Total credits earned
- [ ] "Copy Signup Link" button works
- [ ] Share button works (or falls back to copy)
- [ ] "Learn more" link is present

#### Billing Page Display:
- [ ] Referral code section appears for teachers
- [ ] Code matches dashboard display
- [ ] Copy functionality works
- [ ] Statistics are accurate

### 3. Referral Code Usage Testing

#### Code Validation:
- [ ] Test valid code at signup - should show "60 days free" message
- [ ] Test invalid code - should show error
- [ ] Test lowercase code - should work (auto-uppercase)
- [ ] Test empty code - should proceed without referral

#### Referral Tracking:
- [ ] Uses count increments when code is used
- [ ] Referral relationship is created in database
- [ ] Referrer sees new referral in dashboard
- [ ] Credits are calculated correctly

### 4. Edge Cases

- [ ] Multiple users signing up simultaneously - verify unique codes
- [ ] Database trigger failure - API fallback generates code
- [ ] User changes role - code generation status doesn't change
- [ ] Deleted user - referral code remains valid for existing referrals

## Database Verification Queries

### Check if user has referral code:
```sql
SELECT u.email, u.raw_user_meta_data->>'role' as role, rc.code
FROM auth.users u
LEFT JOIN public.referral_codes rc ON rc.user_id = u.id
WHERE u.email = 'user@example.edu';
```

### Verify code uniqueness:
```sql
SELECT code, COUNT(*) as count
FROM public.referral_codes
GROUP BY code
HAVING COUNT(*) > 1;
-- Should return 0 rows
```

### Check referral statistics:
```sql
-- For a specific user
SELECT 
  rc.code,
  rc.uses_count,
  COUNT(DISTINCT rr.referred_id) as active_referrals,
  SUM(rcred.amount_cents) / 100.0 as total_credits
FROM public.referral_codes rc
LEFT JOIN public.referral_relationships rr ON rr.referrer_id = rc.user_id
LEFT JOIN public.subscriptions s ON s.user_id = rr.referred_id AND s.status = 'active'
LEFT JOIN public.referral_credits rcred ON rcred.user_id = rc.user_id
WHERE rc.user_id = 'USER_ID'
GROUP BY rc.code, rc.uses_count;
```

## Running the Tests

### Integration Tests:
```bash
npm run test:integration -- referral-codes.test.ts
```

### E2E Tests:
```bash
npm run test:e2e -- referral-code-display.test.ts
```

### Full Test Suite:
```bash
npm run test:integration && npm run test:e2e
```

## Environment Requirements

Ensure these environment variables are set:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

## Monitoring

### Key Metrics to Track:
1. Code generation success rate
2. Code uniqueness violations
3. API validation endpoint response times
4. Referral conversion rates
5. Credit calculation accuracy

### Alerts to Set Up:
1. Failed code generation (trigger failures)
2. Duplicate code attempts
3. Validation endpoint errors
4. Credit calculation discrepancies

## Troubleshooting

### Common Issues:

1. **No code generated for teacher**
   - Check if profile was created successfully
   - Verify database trigger is active
   - Check API fallback logic in signup route

2. **Duplicate codes**
   - Check random generation function
   - Verify uniqueness check in trigger
   - Review retry logic

3. **Code not displaying**
   - Verify user role in database
   - Check component mounting conditions
   - Review API response data

4. **Copy functionality not working**
   - Check browser clipboard permissions
   - Verify HTTPS context (required for clipboard API)
   - Test fallback behavior

## Future Enhancements

1. Add code expiration dates
2. Implement code regeneration for users
3. Add bulk code generation for admins
4. Create referral analytics dashboard
5. Add A/B testing for code formats