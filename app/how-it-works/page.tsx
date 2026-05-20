import type { Metadata } from 'next';
import HowItWorksPage from '../components/landing/how-it-works-page';

export const metadata: Metadata = {
  title: 'How Speddy works — for districts, schools, and SpEd providers',
  description:
    'Speddy serves three roles in your K–5 SpEd team — district leaders, site admins, and providers. Here\'s what each role can do.',
};

export default function Page() {
  return <HowItWorksPage />;
}
