export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings?: ValidationWarning[];
  metadata?: {
    checkedConstraints: string[];
    executionTime: number;
    conflictDetails?: any;
  };
}

export interface ValidationError {
  type: ConstraintType;
  message: string;
  severity: 'error' | 'critical';
  details?: {
    conflictingItem?: any;
    timeRange?: { start: string; end: string };
    suggestion?: string;
  };
}

export interface ValidationWarning {
  type: ConstraintType;
  message: string;
  details?: any;
}

export type ConstraintType = 
  | 'work_location'
  | 'consecutive_sessions'
  | 'break_requirement'
  | 'bell_schedule'
  | 'special_activity'
  | 'school_hours'
  | 'concurrent_sessions'
  | 'session_overlap'
  | 'capacity';

export interface ValidationContext {
  providerId: string;
  schoolSite: string;
  day: number;
  startTime: string;
  endTime: string;
}

export interface BatchValidationResult {
  results: Map<string, ValidationResult>;
  summary: {
    totalChecked: number;
    totalValid: number;
    totalInvalid: number;
    commonErrors: Array<{ type: ConstraintType; count: number }>;
  };
}