import { Resend } from 'resend';

// Shared lazy Resend client (SPE-320, lifted from app/api/email-webhook/route.ts).
//
// Lazy-init so the client isn't constructed at module load — its constructor
// throws on a missing key, which breaks `next build` in CI when RESEND_API_KEY
// isn't set (SPE-113). Any route that sends email imports getResend() from here
// so there is a single place the key is read.
let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env['RESEND_API_KEY']);
  }
  return resendClient;
}
