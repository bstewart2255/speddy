// PII scrubbing for Sentry. The app logs teacher/parent emails (and other
// context) in some error/log paths; this is a backstop so that data is redacted
// before it leaves the server for Sentry, even when a log or error slips
// through. The durable fix is to stop logging PII at the source (SPE-91); this
// guards events/logs regardless.
//
// We redact email addresses specifically: they are unambiguous PII with a
// low false-positive rate. Student initials are intentionally NOT regex-matched
// (two-letter strings would produce massive false positives).

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Replace any email addresses in a string with a redaction marker. */
export function redactString(value: string): string {
  return value.replace(EMAIL_RE, '[redacted-email]');
}

/**
 * Recursively redact PII from every string value within an object/array,
 * mutating in place. Depth-capped to avoid pathological/cyclic structures.
 */
export function deepRedact<T>(value: T, depth = 0): T {
  if (value == null || depth > 8) return value;
  if (typeof value === 'string') return redactString(value) as unknown as T;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = deepRedact(value[i], depth + 1);
    return value;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record)) {
      record[key] = deepRedact(record[key], depth + 1);
    }
    return value;
  }
  return value;
}

/** `beforeSend` hook: scrub PII from an error/transaction event. */
export function scrubSentryEvent<T>(event: T): T {
  return deepRedact(event);
}

/** `beforeSendLog` hook: scrub PII from a structured log record. */
export function scrubSentryLog<T>(logRecord: T): T {
  return deepRedact(logRecord);
}
