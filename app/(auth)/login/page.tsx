import LoginForm from './login-form';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <span className="text-4xl font-bold text-gray-900">Speddy</span>
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
  );
}