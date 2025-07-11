import LoginForm from './login-form';
import { ReferralProgramModal } from '../../components/referral-program-modal';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <span className="text-5xl font-logo text-gray-900">Speddy</span>
            </div>

            <h2 className="mt-6 text-center text-2xl font-semibold text-gray-900">
              The friendly SpEd platform :)
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Sign in (or up) to make your SpEd life easier!
            </p>
          </div>
          <LoginForm />
        </div>
      </div>
      {/* Add the modal */}
      <ReferralProgramModal />
      {/* Footer */}
      <footer className="py-4 text-center text-sm text-gray-600">
        Made by SpEd people, for SpEd people.
      </footer>
    </div>
  );
}