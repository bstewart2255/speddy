import { randomInt } from 'crypto';

/**
 * Generate a cryptographically secure random index
 * Uses Node.js crypto.randomInt for secure random number generation
 */
function getSecureRandomIndex(max: number): number {
  return randomInt(0, max);
}

/**
 * Generate a secure temporary password for teacher accounts
 * Format: 12 characters with mixed case, numbers, and symbols
 * Avoids confusing characters like 0/O, 1/l/I
 * Uses cryptographically secure random number generation
 */
export function generateTemporaryPassword(): string {
  // Character sets (avoiding confusing characters)
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // No I, O
  const lowercase = 'abcdefghjkmnpqrstuvwxyz'; // No i, l, o
  const numbers = '23456789'; // No 0, 1
  const symbols = '!@#$%&*';

  // Build password with guaranteed character type distribution
  const password: string[] = [];

  // Ensure at least 2 of each type using cryptographically secure random
  for (let i = 0; i < 2; i++) {
    password.push(uppercase[getSecureRandomIndex(uppercase.length)]);
    password.push(lowercase[getSecureRandomIndex(lowercase.length)]);
    password.push(numbers[getSecureRandomIndex(numbers.length)]);
    password.push(symbols[getSecureRandomIndex(symbols.length)]);
  }

  // Fill remaining 4 characters with random mix
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = 0; i < 4; i++) {
    password.push(allChars[getSecureRandomIndex(allChars.length)]);
  }

  // Shuffle the password array to randomize character positions
  // Using Fisher-Yates shuffle with cryptographically secure random
  for (let i = password.length - 1; i > 0; i--) {
    const j = getSecureRandomIndex(i + 1);
    [password[i], password[j]] = [password[j], password[i]];
  }

  return password.join('');
}

/**
 * Validate password strength
 * Used to verify generated passwords meet security requirements
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain uppercase letters');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain lowercase letters');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain numbers');
  }

  if (!/[!@#$%&*]/.test(password)) {
    errors.push('Password must contain symbols (!@#$%&*)');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}
