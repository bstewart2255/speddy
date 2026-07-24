"use client";

import { useEffect, useState } from "react";
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
 *
 * The password fields are withheld until mount (SPE-331). `page.tsx` is a server
 * component, so without that gate this form's markup is live in the SSR HTML
 * before React attaches, and either kind of early interaction goes wrong:
 *
 *  - **Submitting early** falls back to a NATIVE form submit. With no `method`
 *    that is a GET, which writes the new password in plaintext into the URL —
 *    and from there into server access logs, browser history, and `Referer`.
 *  - **Filling early** (a password manager autofilling on load — the likelier
 *    one, since it needs no speed from the user) is silently discarded: these
 *    are controlled inputs, so hydration resets them to `''` and the user
 *    submits an empty form.
 *
 * Rendering the fields only once mounted removes both: before hydration there
 * is nothing to autofill and nothing to submit. `method="POST"` is kept as a
 * second line of defence so that if this ever renders server-side again, the
 * degenerate submit still cannot put credentials in a URL.
 */
export function ResetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPasswordRequirements, setShowPasswordRequirements] = useState(false);
  // False on the server AND on the first client render, so the two agree and
  // hydration is mismatch-free; the effect then swaps in the real form.
  const [mounted, setMounted] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // Pre-hydration placeholder (SPE-331). Deliberately contains no inputs and no
  // submit control, so there is nothing for a password manager to fill or for a
  // fast click to submit. Sized to match the real form so the swap doesn't shift
  // the page.
  if (!mounted) {
    return (
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div className="space-y-2">
          <div className="h-5 w-32 rounded bg-gray-100" />
          <div className="h-10 w-full rounded-lg bg-gray-100" />
        </div>
        <div className="space-y-2">
          <div className="h-5 w-40 rounded bg-gray-100" />
          <div className="h-10 w-full rounded-lg bg-gray-100" />
        </div>
        <div className="h-10 w-full rounded-lg bg-gray-200" />
        <p className="text-center text-sm text-gray-500">Loading…</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} method="POST" className="space-y-6">
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