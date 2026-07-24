/**
 * SPE-331 — the reset form must not be interactive before React attaches.
 *
 * `/reset-password` is a SERVER component, so without a mount gate this form's
 * markup is live in the SSR HTML before hydration, and either kind of early
 * interaction goes wrong:
 *
 *  - submitting early falls back to a NATIVE submit; with no `method` that is a
 *    GET, putting the new password in plaintext into the URL, the server access
 *    log, browser history, and `Referer`;
 *  - filling early is silently discarded, because these are controlled inputs
 *    and hydration resets them to '' — the user then submits an empty form.
 *
 * These tests pin the two properties that close it: nothing fillable or
 * submittable exists pre-mount, and the real form carries a POST fallback so a
 * native submit can never put credentials in a URL.
 */
import React from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen, waitFor } from '../../../test-utils';
import { ResetPasswordForm } from '@/app/(auth)/reset-password/reset-password-form';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn(), replace: jest.fn() }),
}));

describe('ResetPasswordForm — pre-hydration safety (SPE-331)', () => {
  it('ships no password input and no submit control in the server-rendered HTML', () => {
    // Assert against renderToString rather than a mocked effect: this IS the
    // markup the browser holds during the pre-hydration window, so it tests the
    // threat model directly instead of a transpilation detail.
    const html = renderToString(<ResetPasswordForm />);

    expect(html).not.toContain('<input');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('id="password"');
    expect(html).not.toContain('id="confirmPassword"');
    // And it is not a blank page — the user sees a placeholder.
    expect(html).toContain('Loading');
  });

  it('renders the real form once mounted', async () => {
    const { container } = render(<ResetPasswordForm />);

    await waitFor(() => expect(container.querySelector('#password')).not.toBeNull());
    expect(container.querySelector('#confirmPassword')).not.toBeNull();
    expect(screen.getByRole('button', { name: /reset password/i })).toBeTruthy();
  });

  it('carries a POST fallback so a native submit cannot put the password in a URL', async () => {
    const { container } = render(<ResetPasswordForm />);

    await waitFor(() => expect(container.querySelector('form')).not.toBeNull());
    const form = container.querySelector('form') as HTMLFormElement;

    // The defect was a form with no method: browsers default to GET, which
    // serialises the password into the query string.
    expect(form.getAttribute('method')?.toUpperCase()).toBe('POST');
  });
});
