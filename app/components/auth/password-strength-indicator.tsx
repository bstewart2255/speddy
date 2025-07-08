import { getPasswordStrength } from '../../../lib/utils/password-validation';

interface PasswordStrengthIndicatorProps {
  password: string;
}

export function PasswordStrengthIndicator({ password }: PasswordStrengthIndicatorProps) {
  if (!password) return null;

  const strength = getPasswordStrength(password);

  const strengthConfig = {
    weak: {
      label: 'Weak',
      color: 'bg-red-500',
      width: 'w-1/3',
      textColor: 'text-red-600'
    },
    medium: {
      label: 'Medium',
      color: 'bg-yellow-500',
      width: 'w-2/3',
      textColor: 'text-yellow-600'
    },
    strong: {
      label: 'Strong',
      color: 'bg-green-500',
      width: 'w-full',
      textColor: 'text-green-600'
    }
  };

  const config = strengthConfig[strength];

  return (
    <div className="mt-2">
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs text-gray-500">Password strength:</span>
        <span className={`text-xs font-medium ${config.textColor}`}>
          {config.label}
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${config.color} ${config.width}`}
        />
      </div>
    </div>
  );
}