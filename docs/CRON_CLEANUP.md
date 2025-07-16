# Rate Limit Cleanup Cron Job

This document explains how to set up automatic cleanup of old rate limit records.

## Overview

The cleanup endpoint removes rate limit records older than 7 days to keep the database clean and performant. It can optionally also clean up analytics events older than 90 days.

## Endpoint

```
GET /api/cron/cleanup-uploads?token=your-secret-token
```

or

```
POST /api/cron/cleanup-uploads
Headers: x-cron-secret: your-secret-token
```

## Setup

### 1. Set Environment Variables

Add to your `.env` file:

```bash
# Required - Secret token for cron authentication
CRON_SECRET=your-long-random-secret-here

# Optional - Enable analytics cleanup (default: false)
CLEANUP_ANALYTICS=true
```

Generate a secure random token:
```bash
openssl rand -base64 32
```

### 2. Configure Your Cron Service

#### Option A: cron-job.org (Free)

1. Sign up at https://cron-job.org
2. Create a new cron job:
   - URL: `https://your-app.com/api/cron/cleanup-uploads?token=your-secret-token`
   - Schedule: Daily at 3 AM
   - Request method: GET
   - Request timeout: 30 seconds

#### Option B: EasyCron (Free tier available)

1. Sign up at https://www.easycron.com
2. Add a new cron job:
   - URL: `https://your-app.com/api/cron/cleanup-uploads`
   - Method: POST
   - Headers: `x-cron-secret: your-secret-token`
   - Cron expression: `0 3 * * *` (daily at 3 AM)

#### Option C: Replit Scheduled Tasks

If hosting on Replit, add to `.replit`:

```toml
[[tasks]]
name = "Cleanup Rate Limits"
schedule = "0 3 * * *"
command = "curl -X GET 'https://your-app.repl.co/api/cron/cleanup-uploads?token=your-secret-token'"
```

#### Option D: GitHub Actions

Create `.github/workflows/cleanup.yml`:

```yaml
name: Cleanup Rate Limits
on:
  schedule:
    - cron: '0 3 * * *'  # Daily at 3 AM UTC
  workflow_dispatch:     # Allow manual trigger

jobs:
  cleanup:
    runs-on: ubuntu-latest
    steps:
      - name: Call cleanup endpoint
        run: |
          curl -X GET "${{ secrets.APP_URL }}/api/cron/cleanup-uploads?token=${{ secrets.CRON_SECRET }}"
```

Add secrets in GitHub repository settings:
- `APP_URL`: Your app's URL
- `CRON_SECRET`: Your cron secret token

## Response Format

### Success Response
```json
{
  "success": true,
  "deleted": 127,
  "analyticsDeleted": 456,  // Only if CLEANUP_ANALYTICS=true
  "cutoffDate": "2024-01-09T03:00:00.000Z",
  "processingTimeMs": 234,
  "timestamp": "2024-01-16T03:00:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Database error during cleanup",
  "details": "Error message details",
  "timestamp": "2024-01-16T03:00:00.000Z"
}
```

## Testing

You can manually test the endpoint:

```bash
# Using curl
curl -X GET "http://localhost:3000/api/cron/cleanup-uploads?token=your-secret-token"

# Using httpie
http GET localhost:3000/api/cron/cleanup-uploads token==your-secret-token
```

## Monitoring

1. **Check logs** - The endpoint logs all cleanup actions
2. **Monitor response** - Most cron services provide execution history
3. **Set up alerts** - Configure your cron service to alert on failures

## Security Considerations

1. **Use a strong secret** - Generate a random token at least 32 characters long
2. **Rotate secrets periodically** - Change the CRON_SECRET every few months
3. **Monitor access logs** - Watch for unauthorized access attempts
4. **Use HTTPS** - Always use HTTPS in production

## Database Indexes

Ensure your database has proper indexes for efficient cleanup:

```sql
-- These should already exist from the migration
CREATE INDEX idx_upload_rate_limits_created_at ON upload_rate_limits(created_at);
CREATE INDEX idx_analytics_events_created_at ON analytics_events(created_at);
```

## Customization

You can modify the cleanup behavior:

1. **Change retention period** - Edit the cutoff calculation in the endpoint
2. **Add more cleanup tasks** - Clean up other old data
3. **Add notifications** - Send alerts on successful/failed cleanups
4. **Implement soft deletes** - Archive instead of deleting

## Troubleshooting

### Cleanup not running
- Check CRON_SECRET is set correctly
- Verify the cron service is configured properly
- Check application logs for errors

### Too many records deleted
- Adjust the retention period
- Add additional filters to the delete query

### Performance issues
- Ensure indexes exist on created_at columns
- Consider batching deletes for very large datasets
- Run cleanup more frequently to process smaller batches