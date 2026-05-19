import type { Metadata } from 'next';
import CleanLanding from './components/landing/clean-landing';

export const metadata: Metadata = {
  title: 'Speddy — The friendly elementary SpEd platform',
  description:
    'Speddy organizes every session, every student, and every service minute so SpEd providers and school admins can focus on the work that matters.',
};

export default function Home() {
  return <CleanLanding />;
}
