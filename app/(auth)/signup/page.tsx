import { SignupForm } from './signup-form';

export default function SignupPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header with Speddy logo */}
      <div className="px-4 sm:px-6 lg:px-8 py-4">
        <span className="text-4xl font-logo text-gray-900">Speddy</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8">
          <div>
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
              Create your account
            </h2>
            <p className="mt-2 text-center text-sm text-gray-600">
              Join your school site's collaborative scheduling platform
            </p>
          </div>
          <SignupForm />
        </div>
      </div>
    </div>
  );
}