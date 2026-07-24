"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validatePassword } from "../../../lib/utils/password-validation";
import { PasswordInput } from "../../components/auth/password-input";
import { PasswordRequirements } from "../../components/auth/password-requirements";
import { PasswordStrengthIndicator } from "../../components/auth/password-strength-indicator";

/**
 * "Choose a new password" form for the self-service reset (SPE-68).
 *
 * Only reachable with a live recovery session: `/auth/reset-callback` verifies
 * the emailed link and establishes one, and `page.tsx` re-checks it server-side
 * before rendering this. There is no "current password" field because holding
 * that session is the proof of identity.
 *
 * Submits to `/api/auth/reset-password` rather than calling `updateUser()`
 * directly — the server also has to clear `must_change_password` and
 * `password_reset_requested_at`, which the browser client cannot do.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    // Validate passwords match
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    // Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.errors[0]);
      setLoading(false);
      return;
    }

    try {
      // Goes through the API route rather than calling updateUser() directly:
      // the server also has to clear must_change_password and
      // password_reset_requested_at, which the browser client cannot do (SPE-68).
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result?.error || "Failed to reset password");
      }

      setSuccess(true);
      // The reset session is a real session — send them straight into the app
      // rather than making them log in again with the password they just set.
      router.refresh();
      setTimeout(() => {
        router.push("/dashboard");
      }, 2000);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to reset password");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center space-y-4">
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
          <p className="font-medium">Password reset successfully!</p>
          <p className="text-sm mt-1">
            Taking you to your dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-gray-700">
          New Password
        </label>
        <PasswordInput
          id="password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setShowPasswordRequirements(true)}
          onBlur={() => setShowPasswordRequirements(false)}
          required
        />
        <PasswordStrengthIndicator password={password} />
        <PasswordRequirements 
          password={password} 
          showRequirements={showPasswordRequirements || password.length > 0}
        />
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
          Confirm New Password
        </label>
        <PasswordInput
          id="confirmPassword"
          name="confirmPassword"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
        {confirmPassword && password !== confirmPassword && (
          <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
        )}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Resetting password..." : "Reset password"}
      </button>
    </form>
  );
}