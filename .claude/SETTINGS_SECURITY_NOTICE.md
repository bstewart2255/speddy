# Security Notice for Claude Settings

## Database Modification Commands

The following MCP (Model Context Protocol) commands in `.claude/settings.local.json` allow direct database modifications:

- `mcp__supabase__apply_migration` - Applies database migrations
- `mcp__supabase__execute_sql` - Executes raw SQL commands

### ⚠️ IMPORTANT SECURITY CONSIDERATIONS

1. **Development Only**: These commands should ONLY be enabled in development environments.

2. **Never Enable In Production**: NEVER enable these commands in production or CI/CD environments.

3. **Confirmation Required**: The MCP server should implement explicit confirmation prompts before executing these operations.

4. **Access Control**: Ensure proper authentication and authorization are in place:
   - Use service role keys only in secure, local development environments
   - Never commit service role keys to version control
   - Rotate keys regularly

5. **Audit Trail**: All database modifications should be logged for security auditing.

## Recommended Setup

For production environments, remove or comment out these permissions:

```json
{
  "permissions": {
    "deny": ["mcp__supabase__apply_migration", "mcp__supabase__execute_sql"]
  }
}
```

## Environment Variables

Ensure the following are properly secured:

- `SUPABASE_SERVICE_ROLE_KEY` - Should never be exposed in client-side code
- `TEST_USER_EMAIL` / `TEST_USER_PASSWORD` - Use only for local testing
