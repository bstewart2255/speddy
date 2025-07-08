import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/20/solid';

interface PasswordRequirementsProps {
  password: string;
  showRequirements: boolean;
}

export function PasswordRequirements({ password, showRequirements }: PasswordRequirementsProps) {
  const requirements = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /\d/.test(password) },
    { label: 'One special character (!@#$%^&*)', met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];

  if (!showRequirements) return null;

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs font-medium text-gray-700">Password must contain:</p>
      <ul className="space-y-1">
        {requirements.map((req, index) => (
          <li key={index} className="flex items-center text-xs">
            {req.met ? (
              <CheckCircleIcon className="h-4 w-4 text-green-500 mr-1" />
            ) : (
              <XCircleIcon className="h-4 w-4 text-gray-300 mr-1" />
            )}
            <span className={req.met ? 'text-green-700' : 'text-gray-500'}>
              {req.label}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}