import React from 'react';

// Ensure Tailwind includes these classes
// bg-purple-400 bg-sky-400 bg-cyan-400 bg-emerald-400 bg-amber-400 bg-rose-400

interface TagProps {
  children: React.ReactNode;
  variant?: 'default' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function Tag({ 
  children, 
  variant = 'default', 
  size = 'md', 
  className = '' 
}: TagProps) {
  const baseClasses = 'inline-flex items-center font-medium rounded';

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  const variantClasses = {
    default: 'bg-gray-100 text-gray-800',
    blue: 'bg-blue-100 text-blue-800',
    green: 'bg-green-100 text-green-800', 
    orange: 'bg-orange-100 text-orange-800',
    red: 'bg-red-100 text-red-800',
    purple: 'bg-purple-100 text-purple-800',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <span className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}

// Student initials tag (special case for student identifiers)
interface StudentTagProps {
  initials: string;
  className?: string;
}

export function StudentTag({ initials, className = '' }: StudentTagProps) {
  return (
    <Tag variant="blue" size="md" className={`font-semibold ${className}`}>
      {initials}
    </Tag>
  );
}

// Status tag for completion tracking
interface StatusTagProps {
  completed: number;
  total: number;
  className?: string;
}

export function StatusTag({ completed, total, className = '' }: StatusTagProps) {
  const isComplete = completed === total;
  const variant = isComplete ? 'green' : completed > 0 ? 'orange' : 'gray';

  return (
    <Tag variant={variant} size="sm" className={className}>
      {completed}/{total} {isComplete ? '✓' : ''}
    </Tag>
  );
}

// Grade level tag
interface GradeTagProps {
  grade: string;
  className?: string;
}

export function GradeTag({ grade, className = '' }: GradeTagProps) {
  const trimmedGrade = grade?.toString().trim();

  let colorClasses = '';

  switch (trimmedGrade) {
    case 'K':
      colorClasses = 'bg-purple-400 text-white';
      break;
    case '1':
      colorClasses = 'bg-sky-400 text-white';
      break;
    case '2':
      colorClasses = 'bg-cyan-400 text-white';
      break;
    case '3':
      colorClasses = 'bg-emerald-400 text-white';
      break;
    case '4':
      colorClasses = 'bg-amber-400 text-white';
      break;
    case '5':
      colorClasses = 'bg-rose-400 text-white';
      break;
    default:
      colorClasses = 'bg-gray-100 text-gray-800';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${colorClasses} ${className}`}>
      Grade {grade}
    </span>
  );
}

// Activity type tag
interface ActivityTypeTagProps {
  type: 'assembly' | 'field-trip' | 'presentation' | 'other';
  children: React.ReactNode;
  className?: string;
}

export function ActivityTypeTag({ type, children, className = '' }: ActivityTypeTagProps) {
  const variantMap = {
    'assembly': 'blue' as const,
    'field-trip': 'green' as const,
    'presentation': 'orange' as const,
    'other': 'purple' as const,
  };

  return (
    <Tag variant={variantMap[type]} size="sm" className={className}>
      {children}
    </Tag>
  );
}