These examples should be used as guidance when configuring Sentry functionality within a project.

> ## Speddy policy — read before applying anything below
>
> The rest of this file is **upstream Sentry sample material**. Two of its
> defaults are wrong for this repo, and both have already caused incidents:
>
> 1. **Never enable Sentry Logs.** `enableLogs` must stay `false` (SPE-167).
>    Forwarded console output can carry student context, and this is a FERPA
>    product in a district pilot. The examples below show `enableLogs: true`
>    because they are upstream samples — do not copy that.
> 2. **Never copy a DSN literal from this file.** Speddy's initialization lives
>    in `sentry.server.config.ts`, `sentry.edge.config.ts` and
>    `instrumentation-client.ts`, and all three read their DSN, environment,
>    release and sample rate from `lib/monitoring/sentry-options.ts`. Change that
>    module, not these examples. A stale DSN copied from here is what caused
>    SPE-175, where every event was rejected for months with nothing reporting
>    the failure.
>
> Session Replay is likewise disabled on purpose (SPE-167). If a change would
> widen what leaves the app, raise it rather than applying it.

# Exception Catching

Use `Sentry.captureException(error)` to capture an exception and log the error in Sentry.
Use this in try catch blocks or areas where exceptions are expected

# Tracing Examples

Spans should be created for meaningful actions within an applications like button clicks, API calls, and function calls
Use the `Sentry.startSpan` function to create a span
Child spans can exist within a parent span

## Custom Span instrumentation in component actions

The `name` and `op` properties should be meaninful for the activities in the call.
Attach attributes based on relevant information and metrics from the request

```javascript
function TestComponent() {
  const handleTestButtonClick = () => {
    // Create a transaction/span to measure performance
    Sentry.startSpan(
      {
        op: 'ui.click',
        name: 'Test Button Click',
      },
      span => {
        const value = 'some config';
        const metric = 'some metric';

        // Metrics can be added to the span
        span.setAttribute('config', value);
        span.setAttribute('metric', metric);

        doSomething();
      }
    );
  };

  return (
    <button type="button" onClick={handleTestButtonClick}>
      Test Sentry
    </button>
  );
}
```

## Custom span instrumentation in API calls

The `name` and `op` properties should be meaninful for the activities in the call.
Attach attributes based on relevant information and metrics from the request

```javascript
async function fetchUserData(userId) {
  return Sentry.startSpan(
    {
      op: 'http.client',
      name: `GET /api/users/${userId}`,
    },
    async () => {
      const response = await fetch(`/api/users/${userId}`);
      const data = await response.json();
      return data;
    }
  );
}
```

# Logs

**Speddy: do NOT enable Sentry Logs — keep `enableLogs: false` (SPE-167).** This
whole section is upstream reference material for how the feature works; it is
not an instruction to turn it on here. See the policy block at the top of this
file before changing any logging configuration.

Where logs are used, ensure Sentry is imported using `import * as Sentry from "@sentry/nextjs"`
Upstream enables logging via `Sentry.init({ _experiments: { enableLogs: true } })` — Speddy does not.
Reference the logger using `const { logger } = Sentry`
Sentry offers a consoleLoggingIntegration that can be used to log specific console error types automatically without instrumenting the individual logger calls

## Configuration

In NextJS the client side Sentry initialization is in `instrumentation-client.ts`, the server initialization is in `sentry.edge.config.ts` and the edge initialization is in `sentry.server.config.ts`
Initialization does not need to be repeated in other files, it only needs to happen the files mentioned above. You should use `import * as Sentry from "@sentry/nextjs"` to reference Sentry functionality

### Baseline

> **Upstream sample — not Speddy's configuration.** `enableLogs` must stay
> `false` here, and the DSN comes from `lib/monitoring/sentry-options.ts`. See
> the policy block at the top of this file.

```javascript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  _experiments: {
    enableLogs: true,
  },
});
```

### Logger Integration

```javascript
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  integrations: [
    // send console.log, console.warn, and console.error calls as logs to Sentry
    Sentry.consoleLoggingIntegration({ levels: ['log', 'warn', 'error'] }),
  ],
});
```

## Logger Examples

`logger.fmt` is a template literal function that should be used to bring variables into the structured logs.

```javascript
logger.trace('Starting database connection', { database: 'users' });
logger.debug(logger.fmt`Cache miss for user: ${userId}`);
logger.info('Updated profile', { profileId: 345 });
logger.warn('Rate limit reached for endpoint', {
  endpoint: '/api/results/',
  isEnterprise: false,
});
logger.error('Failed to process payment', {
  orderId: 'order_123',
  amount: 99.99,
});
logger.fatal('Database connection pool exhausted', {
  database: 'users',
  activeConnections: 100,
});
```
