#!/bin/bash

# Post-Migration Database Maintenance Script
# This script runs VACUUM and ANALYZE commands outside of transaction blocks
#
# Usage:
#   ./scripts/run_post_migration_maintenance.sh
#
# Requirements:
#   - Supabase CLI installed
#   - Connected to your Supabase project
#   OR
#   - PostgreSQL client (psql) installed
#   - Database connection details in environment variables

set -e  # Exit on error

echo "=================================================="
echo "Post-Migration Database Maintenance"
echo "=================================================="
echo ""

# Check if using Supabase CLI or direct psql
if command -v supabase &> /dev/null; then
    echo "Using Supabase CLI..."
    echo ""

    # Run each VACUUM command separately (cannot be in transaction)
    echo "Running VACUUM ANALYZE on affected tables..."

    supabase db execute --query "VACUUM ANALYZE public.saved_worksheets;" || echo "Warning: Failed to vacuum saved_worksheets"
    supabase db execute --query "VACUUM ANALYZE public.exit_ticket_results;" || echo "Warning: Failed to vacuum exit_ticket_results"
    supabase db execute --query "VACUUM ANALYZE public.lessons;" || echo "Warning: Failed to vacuum lessons"
    supabase db execute --query "VACUUM ANALYZE public.documents;" || echo "Warning: Failed to vacuum documents"

    echo ""
    echo "Running ANALYZE on tables with new indexes..."

    # These can run in a single transaction
    supabase db execute --query "
        ANALYZE public.schedule_sessions;
        ANALYZE public.students;
        ANALYZE public.exit_tickets;
        ANALYZE public.profiles;
        ANALYZE public.bell_schedules;
        ANALYZE public.calendar_events;
        ANALYZE public.special_activities;
        ANALYZE public.teachers;
        ANALYZE public.provider_schools;
        ANALYZE public.schools;
        ANALYZE public.subscriptions;
        ANALYZE public.referral_relationships;
        ANALYZE public.holidays;
        ANALYZE public.analytics_events;
        ANALYZE public.audit_logs;
        ANALYZE public.worksheets;
        ANALYZE public.worksheet_submissions;
        ANALYZE public.student_details;
    "

elif command -v psql &> /dev/null; then
    echo "Using psql directly..."
    echo ""

    # Check for required environment variables
    if [ -z "$DB_HOST" ] || [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
        echo "Error: Missing required environment variables"
        echo "Please set: DB_HOST, DB_USER, DB_NAME"
        echo ""
        echo "Example:"
        echo "  export DB_HOST=db.your-project.supabase.co"
        echo "  export DB_USER=postgres"
        echo "  export DB_NAME=postgres"
        echo "  export PGPASSWORD=your-password"
        exit 1
    fi

    # Run VACUUM commands (each in its own connection, outside transaction)
    echo "Running VACUUM ANALYZE on affected tables..."

    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE public.saved_worksheets;" || echo "Warning: Failed to vacuum saved_worksheets"
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE public.exit_ticket_results;" || echo "Warning: Failed to vacuum exit_ticket_results"
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE public.lessons;" || echo "Warning: Failed to vacuum lessons"
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "VACUUM ANALYZE public.documents;" || echo "Warning: Failed to vacuum documents"

    echo ""
    echo "Running ANALYZE on tables with new indexes..."

    # Run ANALYZE commands (can be in a single connection)
    psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" << 'EOF'
        ANALYZE public.schedule_sessions;
        ANALYZE public.students;
        ANALYZE public.exit_tickets;
        ANALYZE public.profiles;
        ANALYZE public.bell_schedules;
        ANALYZE public.calendar_events;
        ANALYZE public.special_activities;
        ANALYZE public.teachers;
        ANALYZE public.provider_schools;
        ANALYZE public.schools;
        ANALYZE public.subscriptions;
        ANALYZE public.referral_relationships;
        ANALYZE public.holidays;
        ANALYZE public.analytics_events;
        ANALYZE public.audit_logs;
        ANALYZE public.worksheets;
        ANALYZE public.worksheet_submissions;
        ANALYZE public.student_details;
EOF

else
    echo "Error: Neither 'supabase' CLI nor 'psql' found"
    echo "Please install one of:"
    echo "  - Supabase CLI: https://supabase.com/docs/guides/cli"
    echo "  - PostgreSQL client: https://www.postgresql.org/download/"
    exit 1
fi

echo ""
echo "=================================================="
echo "✅ Post-migration maintenance completed!"
echo "=================================================="
echo ""
echo "Summary:"
echo "  - Storage optimized via VACUUM"
echo "  - Query planner statistics updated via ANALYZE"
echo "  - Database ready for production workloads"
echo ""
