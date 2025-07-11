'use client';

import { SubscriptionManager } from '@/app/components/billing/subscription-manager';

export default function BillingPage() {
  return (
    <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Billing & Subscription</h1>
      <SubscriptionManager />
    </div>
  );
}