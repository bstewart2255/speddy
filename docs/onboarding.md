# Speddy Onboarding Guide

This guide walks new contributors through setting up Speddy locally and understanding how the team works in Replit and Supabase.

## 1) Local development setup
1. **Clone the repository** and install dependencies:
   ```bash
   npm install
   ```
2. **Environment variables** – create `.env.local` in the project root:
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=your-url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are required for the Next.js app and integration tests.
   - `SUPABASE_SERVICE_ROLE_KEY` is required for migration and data-import scripts that need elevated privileges.
3. **Run the app**:
   ```bash
   npm run dev
   ```
   The dev server runs on http://localhost:3000.
4. **Run checks** before opening a PR:
   ```bash
   npm run lint
   npm run typecheck
   npm run test:basic
   ```
   Integration tests (`npm run test:integration`) require a Supabase instance configured with the schema from `supabase/migrations/`.

## 2) Database workflow
- SQL migrations live in `supabase/migrations/` and follow `YYYYMMDD_description.sql` naming.
- Apply migrations to a Supabase instance with the service role key via `node scripts/run-migrations.js`.
- For production, migrations are executed manually in Supabase; keep the migration files committed for traceability.
- Seed data: use `scripts/seed.js` after setting `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SEED_PROVIDER_ID` to load basic fixtures.

## 3) Replit usage
- Replit is the always-on deployment target; production runs directly from the main branch pulled into Replit.
- After a PR is merged, refresh Replit with:
  ```bash
  git pull origin main
  npm run dev
  ```
- Replit should have the same env vars as `.env.local` to keep behavior consistent.

## 4) Contribution expectations
- Work on feature branches and open pull requests; direct commits to `main` are avoided.
- Describe schema changes clearly and add SQL files for any database adjustments, even when applied manually.
- Provide reproduction steps and screenshots for UI changes when possible to help reviewers.

## 5) Helpful references
- `speddy-dev-workflow-v3.md` – detailed team workflow, branching strategy, and environment notes.
- `supabase/migrations/` – current database schema history.
- `scripts/` – utilities for data import, validation, and migrations.
