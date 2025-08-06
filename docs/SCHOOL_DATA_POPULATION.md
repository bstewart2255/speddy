# School Data Population Guide

## Overview

This guide explains how to populate the Supabase database with comprehensive US school district and school data from the National Center for Education Statistics (NCES). This migration replaces the free-text school entry system with a structured dropdown system, eliminating fuzzy matching issues and ensuring data consistency.

## What Gets Imported

- **50+ US States and Territories**: All states, DC, and US territories
- **~15,000 School Districts**: All public school districts across the US
- **~130,000 Schools**: All public schools (elementary, middle, high schools)

## Prerequisites

1. **Database Migration**: Run the migration to create the necessary tables:

   ```bash
   # Apply the migration to your Supabase project
   supabase migration up
   ```

2. **Environment Setup**: Copy and configure the environment variables:

   ```bash
   cp .env.example.schools .env.schools
   # Edit .env.schools with your Supabase credentials
   ```

3. **Install Dependencies**: Install required packages:
   ```bash
   npm install
   ```

## Configuration

### Required Environment Variables

```env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Optional Configuration

```env
# Performance Tuning
BATCH_SIZE=100                  # Records per batch (default: 100)
RATE_LIMIT_DELAY=1000           # MS between API calls (default: 1000)
MAX_RETRIES=3                   # Retry attempts (default: 3)
CONCURRENT_REQUESTS=5           # Parallel requests (default: 5)

# Use CSV files instead of API
USE_CSV_FALLBACK=false          # Set to true for CSV import
DISTRICTS_CSV_PATH=./data/districts.csv
SCHOOLS_CSV_PATH=./data/schools.csv
```

## Running the Import

### Full Import

```bash
npm run populate:schools
```

### Test Import (Small Batch)

```bash
npm run populate:schools:test
```

This runs with `BATCH_SIZE=10` for testing purposes.

## Data Sources

### Primary: Urban Institute Education Data API

The script uses the Urban Institute's Education Data Portal API by default:

- Base URL: `https://educationdata.urban.org/api/v1/schools/ccd/directory/`
- Data Year: 2022 (most recent complete dataset)
- Documentation: https://educationdata.urban.org/documentation/

### Alternative: NCES CSV Files

If the API is restrictive or unavailable, download CSV files from:

- URL: https://nces.ed.gov/ccd/files.asp
- Download:
  - Public Elementary/Secondary School Universe Survey Data
  - Local Education Agency Universe Survey Data
- Place files in `./data/` directory
- Set `USE_CSV_FALLBACK=true` in environment

## Import Process

### Phase 1: Districts Import

1. Iterates through each state
2. Fetches all districts for that state
3. Transforms NCES data to match our schema
4. Batch inserts with retry logic
5. Tracks progress for resume capability

### Phase 2: Schools Import

1. Fetches all imported districts
2. For each district, fetches associated schools
3. Transforms and validates school data
4. Batch inserts with concurrency limits
5. Updates progress tracking

## Features

### Resume Capability

- Progress saved to `nces-import-progress.json`
- Automatically resumes from last successful batch
- Skips already imported records

### Error Handling

- Automatic retry with exponential backoff
- Detailed error logging to `nces-import-errors.log`
- Failed records logged for manual review
- Process continues despite individual failures

### Performance Optimizations

- Batch processing (configurable size)
- Concurrent requests with limits
- Rate limiting to respect API limits
- Database indexes for fast lookups
- Full-text search indexes for autocomplete

## Progress Monitoring

The script provides real-time progress updates:

```
📚 Processing districts for California (CA)...
  Found 1,026 districts
  ✅ Batch 1/11 complete (100/1026)
  ✅ Batch 2/11 complete (200/1026)
  ...
```

## Database Schema

### States Table

- `id`: State abbreviation (e.g., 'CA')
- `name`: Full state name
- `abbreviation`: 2-letter code

### Districts Table

- `id`: NCES LEA ID
- `name`: District name
- `city`, `zip_code`, `county`: Location data
- `enrollment_total`: Total student enrollment
- `schools_count`: Number of schools

### Schools Table

- `id`: NCES School ID
- `name`: School name
- `school_type`: Elementary, Middle, High, etc.
- `enrollment_total`: Student count
- `latitude`, `longitude`: Geographic coordinates
- Additional demographic and program data

## Troubleshooting

### Common Issues

1. **API Rate Limiting**
   - Increase `RATE_LIMIT_DELAY` value
   - Reduce `CONCURRENT_REQUESTS`

2. **Memory Issues**
   - Reduce `BATCH_SIZE`
   - Process one state at a time

3. **Network Timeouts**
   - Increase `MAX_RETRIES`
   - Check internet connection

4. **Database Errors**
   - Verify Supabase service role key
   - Check RLS policies
   - Ensure tables exist

### Logs and Debugging

- **Progress File**: `nces-import-progress.json`
- **Error Log**: `nces-import-errors.log`
- **Database Tracking**: `nces_import_progress` table

## Verification

After import, verify the data:

```sql
-- Check counts
SELECT COUNT(*) FROM states;    -- Should be 50+
SELECT COUNT(*) FROM districts; -- Should be ~15,000
SELECT COUNT(*) FROM schools;   -- Should be ~130,000

-- Check specific state
SELECT COUNT(*) FROM districts WHERE state_id = 'CA';
SELECT COUNT(*) FROM schools WHERE state_id = 'CA';

-- Check import errors
SELECT * FROM nces_import_errors ORDER BY created_at DESC LIMIT 10;
```

## Next Steps

After successful import:

1. **Update Application Code**:
   - Replace free-text inputs with dropdown selectors
   - Use the new school/district IDs for team matching
   - Update search functionality to use indexed columns

2. **Data Migration**:
   - Map existing free-text entries to structured IDs
   - Update user profiles with correct school/district IDs
   - Clean up old normalized name functions

3. **Testing**:
   - Verify dropdown performance
   - Test team matching with new IDs
   - Ensure search/autocomplete works properly

## Support

For issues or questions:

- Check error logs first
- Review the NCES data documentation
- Verify environment configuration
- Test with small batches before full import
