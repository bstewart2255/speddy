# Speddy

Speddy is a scheduling and caseload management tool for special education providers. It uses Next.js 14, Supabase, and Tailwind CSS to help providers coordinate student services across schools while enforcing role-based access controls and scheduling constraints.

## Quick start

### Prerequisites
- Node.js 18+
- npm 10+
- Access to a Supabase project with anon and service role keys

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Create a `.env.local` file with your Supabase credentials:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
   The service role key is required for data import and migration scripts; the anon key is used by the application and integration tests.
3. Start the app:
   ```bash
   npm run dev
   ```
   The app runs at http://localhost:3000.

### Common scripts
- `npm run dev` – start the Next.js dev server
- `npm run lint` – lint the codebase
- `npm run typecheck` – full TypeScript checks
- `npm run test:basic` – sanity smoke test
- `npm run test:integration` – integration test suite (requires Supabase env vars)
- `npm run build` – production build

## Database and migrations
- SQL migrations are stored in `supabase/migrations/` using the naming convention `YYYYMMDD_description.sql`.
- Production database changes are applied manually in Supabase; keep migration files committed for history.
- For local testing you can run `node scripts/run-migrations.js` after setting `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.

## Onboarding and workflows
- New contributors should start with the [onboarding guide](docs/onboarding.md) for step-by-step local setup, Replit tips, and testing expectations.
- See `speddy-dev-workflow-v3.md` for branch strategy, PR expectations, and background on how the team uses Supabase and Replit.

## Project structure
- `app/` – Next.js app router pages and UI components
- `lib/` – scheduling engines, Supabase clients, and shared utilities
- `supabase/` – database migrations and generated types
- `scripts/` – data import, migration, and verification scripts
- `tests/` – integration and end-to-end checks

## Support
Please open issues or pull requests with detailed context. Include reproduction steps and any relevant logs when reporting bugs.
