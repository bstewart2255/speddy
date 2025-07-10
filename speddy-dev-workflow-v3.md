# Speddy Development Workflow & Process

## Development Environment
- **IDE**: Replit (primary development environment & deployment platform)
- **Version Control**: GitHub repository at `bstewart2255/speddy`
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Replit (application runs directly from Replit)

## Development Workflow

### 1. Code Changes
- Claude creates changes in a new branch via GitHub MCP tools
- Opens a pull request with descriptive title and explanation
- **Pull requests are required** - no direct commits to main branch
- **Database Review**: If any database changes would be needed for new code implementation, Claude will first review existing database tables before suggesting new tables or columns are needed
- Blair reviews and merges PRs once approved

### 2. Testing Process
```bash
# After PR is merged, in Replit shell:
git pull origin main  # Pull latest changes
npm run dev          # Test locally (if needed)
```

### 3. Database Changes
- **Create migration files** in `supabase/migrations/` directory for record keeping
- Migration naming format: `YYYYMMDD_descriptive_name.sql`
- **Provide SQL queries directly to Blair** for manual execution in Supabase SQL Editor
- Keep migration files as documentation of database changes
- Blair will manually apply SQL changes to the database

### 4. Deployment
- **Application**: Deployed directly via Replit (always running)
- **Database Migrations**: Manual via `supabase db push --linked`
- Replit automatically serves the production application

## Project Architecture

### Tech Stack
- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: Supabase (Auth, Database, Real-time)
- **UI Components**: Custom components in `app/components/`
- **Database Types**: Generated TypeScript types in `src/types/database.ts`

### Key Patterns
1. **Authentication**: Supabase Auth with row-level security
2. **Data Fetching**: Client components with `createClientComponentClient`
3. **Styling**: Tailwind CSS utility classes
4. **State Management**: React hooks and context (see `SchoolProvider`)

### Important Context
- Multi-tenant system where providers can work at multiple schools
- Team matching uses fuzzy matching for school/district names
- School context is managed globally via `SchoolProvider`
- RLS policies enforce data isolation between providers

## Database Conventions

### Tables Structure
- `profiles`: User profiles with role, school info
- `provider_schools`: Multi-school associations
- `students`: Student records linked to providers
- `schedule_sessions`: Scheduling data
- `bell_schedules`, `special_activities`: School schedule constraints

### Naming Conventions
- Snake_case for database (e.g., `school_site`)
- camelCase for TypeScript/JavaScript
- Fuzzy matching functions: `normalize_school_name()`, `normalize_district_name()`

## Common Tasks

### Adding a New Feature
1. Create a new branch: `git checkout -b feature/description`
2. Create database migration if schema changes needed
3. Update TypeScript types if needed
4. Implement UI components
5. Commit changes with clear messages
6. Push branch and open PR: `git push origin feature/description`
7. Blair reviews and merges PR
8. Pull merged changes in Replit: `git pull origin main`

### Debugging
- Check Supabase logs for RLS policy issues
- Use `console.log` for client-side debugging
- Verify school context with `useSchool()` hook

### Performance Considerations
- Database indexes exist on normalized school names
- Use Supabase's built-in caching
- Implement pagination for large datasets

## MCP Tool Usage
When using MCP tools:
- `github:` - Repository operations (use `create_branch`, `create_pull_request`)
- `supabase:` - Database queries and modifications
- `filesystem:` - Local file operations (use sparingly)
- Always create PRs instead of direct commits to main
- Always confirm before overwriting/deleting content

## Contact & Context
- **Project**: Speddy - Special Education scheduling and caseload management
- **Primary Developer**: Blair Stewart
- **Key Features**: Multi-school support, team collaboration, fuzzy school matching
- **Current Focus**: Improving team member matching and scheduling conflict detection
