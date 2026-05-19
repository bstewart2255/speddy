import { redirect } from 'next/navigation';

// Friendly entry point for the app. Unauthenticated visitors are sent to
// /login by middleware; authenticated visitors land on the dashboard, where
// role-based routing takes over.
export default function AppEntry() {
  redirect('/dashboard');
}
