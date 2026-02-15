# Database Migrations

This folder contains SQL migration scripts for setting up the Supabase database.

## How to Run Migrations

### Option 1: Via Supabase SQL Editor (Recommended)

1. Go to your Supabase Dashboard: https://supabase.com/dashboard/project/ezsxjsobmzydrughvijl/sql/new
2. Open the migration file: `001_create_story_runs.sql`
3. Copy the entire SQL content
4. Paste it into the SQL Editor
5. Click **Run** to execute

### Option 2: Via Supabase CLI

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref ezsxjsobmzydrughvijl

# Run migration
supabase db push
```

## Migrations List

- **001_create_story_runs.sql** - Creates the main `story_runs` table with RLS policies

## Verify Migration

After running the migration, you can verify it worked by running:

```bash
cd backend
python setup_supabase.py
```

This should show: ✅ Table 'story_runs' already exists!
