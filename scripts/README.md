# Migration Scripts

## Generate Session Instances

This script migrates from template-only architecture to instance-based architecture by generating dated instances for all existing template sessions.

### Prerequisites

- Node.js and npm installed
- Environment variables configured (`.env.local`):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

### Usage

**Basic usage (generates 8 weeks of instances):**

```bash
npx tsx scripts/migrate-to-instances.ts
```

**Custom number of weeks:**

```bash
npx tsx scripts/migrate-to-instances.ts --weeks 12
```

### What it does

1. Fetches all template sessions (sessions with `session_date = NULL` and scheduled times)
2. For each template:
   - Generates instances for the next N weeks (default: 8)
   - Checks for existing instances to avoid duplicates
   - Creates new instance rows with all template fields copied
3. Reports summary of instances created and any errors

### Alternative: API Endpoint

You can also trigger the migration via API endpoint:

**Check migration status:**

```bash
curl -X GET https://your-domain.com/api/migrations/generate-instances \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Run migration (admin only):**

```bash
curl -X POST https://your-domain.com/api/migrations/generate-instances \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"weeksAhead": 8}'
```

### Notes

- The script is idempotent - it won't create duplicate instances if run multiple times
- Only scheduled templates (with day_of_week, start_time, end_time) are processed
- The API endpoint requires admin role for security
- Template sessions remain in the database after migration (they are not deleted)
