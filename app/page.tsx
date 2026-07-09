import type { Metadata } from 'next';
import SpeddyLanding from './components/landing/speddy-landing';

export const metadata: Metadata = {
  title: 'Speddy — The friendly SpEd platform',
  description:
    'Speddy organizes every session, every student, and every service minute so SpEd providers, site admins, and district directors can focus on the work that matters.',
};

export default function Home() {
  return <SpeddyLanding />;
}
