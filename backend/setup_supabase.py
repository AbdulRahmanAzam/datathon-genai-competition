"""
Setup script to create the story_runs table in Supabase.
Run this once to initialize the database schema.
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client

# Load environment variables
env_path = Path(__file__).parent / ".env"
load_dotenv(env_path)

# SQL to create the table
CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS story_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    characters JSONB NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    timeline JSONB NOT NULL DEFAULT '[]',
    summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);
"""

ENABLE_RLS_SQL = """
ALTER TABLE story_runs ENABLE ROW LEVEL SECURITY;
"""

CREATE_POLICY_SQL = """
CREATE POLICY IF NOT EXISTS "Allow all operations" 
ON story_runs FOR ALL 
USING (true) 
WITH CHECK (true);
"""


def main():
    # Get Supabase credentials
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    
    if not url or not key:
        print("❌ Error: SUPABASE_URL and SUPABASE_KEY must be set in .env file")
        sys.exit(1)
    
    print(f"🔗 Connecting to Supabase: {url}")
    
    try:
        # Create Supabase client
        client = create_client(url, key)
        
        print("📋 Creating story_runs table...")
        
        # Execute SQL via RPC (Supabase Edge Function) or direct REST API
        # Note: The Python client doesn't support direct SQL execution
        # We need to use the service_role key or run this in SQL Editor
        
        # Try to insert a test record to check if table exists
        try:
            result = client.table("story_runs").select("id").limit(1).execute()
            print("✅ Table 'story_runs' already exists!")
            return
        except Exception as e:
            error_msg = str(e)
            if "PGRST205" in error_msg or "Could not find the table" in error_msg:
                print("⚠️  Table 'story_runs' does not exist.")
                print("\n" + "="*70)
                print("📝 Please run the following SQL in your Supabase SQL Editor:")
                print("   https://supabase.com/dashboard/project/ezsxjsobmzydrughvijl/sql/new")
                print("="*70)
                print("\n" + CREATE_TABLE_SQL)
                print(ENABLE_RLS_SQL)
                print(CREATE_POLICY_SQL)
                print("\n" + "="*70)
                print("\n💡 Steps:")
                print("   1. Go to your Supabase Dashboard")
                print("   2. Navigate to SQL Editor")
                print("   3. Copy and paste the SQL above")
                print("   4. Click 'Run' to execute")
                print("   5. Run this script again to verify")
                sys.exit(1)
            else:
                raise e
                
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
