export const tokens = {
  colors: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3182ce',  // ← Updated to match mockups
      600: '#2c5aa0',  // ← Updated hover state
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
    }, 
    secondary: {
      50: '#f5f3ff',
      100: '#ede9fe',
      200: '#ddd6fe',
      300: '#c4b5fd',
      400: '#a78bfa',
      500: '#8b5cf6',
      600: '#7c3aed',
      700: '#6d28d9',
      800: '#5b21b6',
      900: '#4c1d95',
    },
    success: {
      50: '#f0fdf4',
      500: '#38a169',  // ← Change from '#10b981'
      600: '#059669',
    },
    warning: {
      50: '#fffbeb',
      500: '#f59e0b',
      600: '#d97706',
    },
    danger: {
      50: '#fef2f2',
      500: '#e53e3e',  // ← Change from '#ef4444'
      600: '#dc2626',
    },
    gray: {
      50: '#f8fafc',
      100: '#f1f5f9',
      200: '#e2e8f0',
      300: '#cbd5e1',
      400: '#94a3b8',
      500: '#64748b',
      600: '#475569',
      700: '#334155',
      800: '#1e293b',
      900: '#0f172a',
    },
    schedule: {
      bell: 'rgba(239, 68, 68, 0.7)',
      special: 'rgba(245, 158, 11, 0.7)',
      session: 'rgba(59, 130, 246, 0.7)',
      cross: 'rgba(168, 85, 247, 0.7)',
      available: 'rgba(134, 239, 172, 0.5)',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
    '2xl': '3rem',
  },
  fontSize: {
    xs: '0.75rem',
    sm: '0.875rem',
    base: '1rem',
    lg: '1.125rem',
    xl: '1.25rem',
    '2xl': '1.5rem',
    '3xl': '1.875rem',
  },
  borderRadius: {
    sm: '0.25rem',
    md: '0.375rem',
    lg: '0.5rem',
    xl: '0.75rem',
  },
  shadows: {
    sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
    md: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
    lg: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    xl: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
  },
  zIndex: {
    dropdown: 1000,
    modal: 1050,
    popover: 1100,
    tooltip: 1150,
  },
  transition: {
    fast: '150ms ease-in-out',
    base: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },
} as const;

// Helper function to get CSS variable
export const getCSSVariable = (variable: string): string => {
  if (typeof window !== 'undefined') {
    return getComputedStyle(document.documentElement).getPropertyValue(variable);
  }
  return '';
};

// Type-safe style utilities
export const styleUtils = {
  // Schedule block styles (solving your inline styles issue)
  getScheduleBlockStyle: (type: 'bell' | 'special' | 'session' | 'cross' | 'available') => ({
    backgroundColor: tokens.colors.schedule[type],
  }),

  // Common component styles
  cardStyle: {
    backgroundColor: tokens.colors.gray[50],
    borderRadius: tokens.borderRadius.lg,
    boxShadow: tokens.shadows.sm,
    padding: tokens.spacing.md,
  },

  buttonPrimary: {
    backgroundColor: tokens.colors.primary[600],
    color: 'white',
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    borderRadius: tokens.borderRadius.md,
    transition: `background-color ${tokens.transition.fast}`,
  },

  buttonSecondary: {
    backgroundColor: 'transparent',
    color: tokens.colors.primary[600],
    border: `1px solid ${tokens.colors.primary[600]}`,
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    borderRadius: tokens.borderRadius.md,
    transition: `all ${tokens.transition.fast}`,
  },

  buttonDanger: {
    backgroundColor: tokens.colors.danger[600],
    color: 'white',
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    borderRadius: tokens.borderRadius.md,
    transition: `background-color ${tokens.transition.fast}`,
  },

  inputStyle: {
    width: '100%',
    padding: `${tokens.spacing.sm} ${tokens.spacing.md}`,
    borderRadius: tokens.borderRadius.md,
    border: `1px solid ${tokens.colors.gray[300]}`,
    fontSize: tokens.fontSize.base,
    transition: `border-color ${tokens.transition.fast}`,
  },

  labelStyle: {
    display: 'block',
    marginBottom: tokens.spacing.xs,
    fontSize: tokens.fontSize.sm,
    fontWeight: '500',
    color: tokens.colors.gray[700],
  },
};

// Tailwind class mappings for consistency
export const tw = {
  // Buttons
  button: {
    base: 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
    primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
    secondary: 'bg-transparent text-primary-600 border border-primary-600 hover:bg-primary-50',
    danger: 'bg-danger-600 text-white hover:bg-danger-700 focus:ring-danger-500',
    size: {
      sm: 'px-3 py-1.5 text-sm rounded-md',
      md: 'px-4 py-2 text-base rounded-md',
      lg: 'px-6 py-3 text-lg rounded-lg',
    },
  },

  // Cards
  card: 'bg-white rounded-lg shadow-sm p-6',

  // Forms
  input: 'w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
  label: 'block text-sm font-medium text-gray-700 mb-1',

  // Layout
  container: 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8',

  // States
  disabled: 'opacity-50 cursor-not-allowed',
  error: 'border-danger-500 focus:ring-danger-500',
};