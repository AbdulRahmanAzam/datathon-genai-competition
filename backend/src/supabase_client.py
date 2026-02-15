"""
Supabase client for storing and retrieving story runs.

Table schema (create in Supabase SQL Editor):

CREATE TABLE story_runs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    characters JSONB NOT NULL,
    events JSONB NOT NULL DEFAULT '[]',
    timeline JSONB NOT NULL DEFAULT '[]',
    summary JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE story_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations" ON story_runs
    FOR ALL USING (true) WITH CHECK (true);
"""

import os
import json
from datetime import datetime
from typing import Optional, List, Dict, Any

from supabase import create_client, Client


_client: Optional[Client] = None
_table_exists: Optional[bool] = None  # cached check


def get_supabase() -> Optional[Client]:
    """Get or create Supabase client singleton. Returns None if not configured."""
    global _client
    if _client is None:
        url = os.getenv("SUPABASE_URL")
        key = os.getenv("SUPABASE_KEY")
        if not url or not key:
            return None
        _client = create_client(url, key)
    return _client


TABLE = "story_runs"


def _check_table_error(error) -> bool:
    """Check if an error indicates the table doesn't exist."""
    error_str = str(error)
    return "PGRST205" in error_str or "Could not find the table" in error_str


def _log_table_missing():
    """Log a helpful message when the story_runs table is missing."""
    print(
        "[Supabase] Table 'story_runs' does not exist. "
        "Create it in the Supabase SQL Editor with:\n"
        "  CREATE TABLE story_runs (\n"
        "    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,\n"
        "    title TEXT NOT NULL,\n"
        "    description TEXT NOT NULL,\n"
        "    characters JSONB NOT NULL,\n"
        "    events JSONB NOT NULL DEFAULT '[]',\n"
        "    timeline JSONB NOT NULL DEFAULT '[]',\n"
        "    summary JSONB DEFAULT '{}',\n"
        "    created_at TIMESTAMPTZ DEFAULT now()\n"
        "  );\n"
        "  ALTER TABLE story_runs ENABLE ROW LEVEL SECURITY;\n"
        "  CREATE POLICY \"Allow all\" ON story_runs FOR ALL USING (true) WITH CHECK (true);"
    )


async def create_story_run(
    title: str,
    description: str,
    characters: List[Dict[str, str]],
) -> Optional[str]:
    """Create an initial story run record. Returns the run ID for incremental updates."""
    global _table_exists
    if _table_exists is False:
        return None
    try:
        client = get_supabase()
        if client is None:
            return None
        data = {
            "title": title,
            "description": description,
            "characters": characters,
            "events": [],
            "timeline": [],
            "summary": {"status": "in_progress"},
        }
        result = client.table(TABLE).insert(data).execute()
        _table_exists = True
        if result.data:
            run_id = result.data[0]["id"]
            print(f"[Supabase] Created story run: {run_id}")
            return run_id
        return None
    except Exception as e:
        if _check_table_error(e):
            _table_exists = False
            _log_table_missing()
        else:
            print(f"[Supabase] Error creating story run: {e}")
        return None


async def update_story_run(
    run_id: str,
    events: List[Dict[str, Any]],
    timeline: List[Dict[str, Any]],
    summary: Optional[Dict[str, Any]] = None,
) -> bool:
    """Update a story run with new events and timeline data (incremental save)."""
    global _table_exists
    if _table_exists is False:
        return False
    try:
        client = get_supabase()
        if client is None:
            return False
        data = {
            "events": events,
            "timeline": timeline,
        }
        if summary:
            data["summary"] = summary
        client.table(TABLE).update(data).eq("id", run_id).execute()
        return True
    except Exception as e:
        if _check_table_error(e):
            _table_exists = False
            _log_table_missing()
        else:
            print(f"[Supabase] Error updating story run {run_id}: {e}")
        return False


async def save_story_run(
    title: str,
    description: str,
    characters: List[Dict[str, str]],
    events: List[Dict[str, Any]],
    timeline: List[Dict[str, Any]],
    summary: Dict[str, Any],
) -> Optional[str]:
    """Save a completed story run to Supabase. Returns the run ID."""
    global _table_exists
    if _table_exists is False:
        return None
    try:
        client = get_supabase()
        if client is None:
            return None
        data = {
            "title": title,
            "description": description,
            "characters": characters,
            "events": events,
            "timeline": timeline,
            "summary": summary,
        }
        result = client.table(TABLE).insert(data).execute()
        _table_exists = True
        if result.data:
            run_id = result.data[0]["id"]
            print(f"[Supabase] Saved story run: {run_id}")
            return run_id
        return None
    except Exception as e:
        if _check_table_error(e):
            _table_exists = False
            _log_table_missing()
        else:
            print(f"[Supabase] Error saving story run: {e}")
        return None


async def list_story_runs(limit: int = 50) -> List[Dict[str, Any]]:
    """List recent story runs (without full events data for speed)."""
    global _table_exists
    if _table_exists is False:
        return []
    try:
        client = get_supabase()
        if client is None:
            return []
        result = (
            client.table(TABLE)
            .select("id, title, description, characters, summary, created_at")
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        _table_exists = True
        return result.data or []
    except Exception as e:
        if _check_table_error(e):
            _table_exists = False
            _log_table_missing()
        else:
            print(f"[Supabase] Error listing story runs: {e}")
        return []


async def get_story_run(run_id: str) -> Optional[Dict[str, Any]]:
    """Get a single story run by ID with full data."""
    global _table_exists
    if _table_exists is False:
        return None
    try:
        client = get_supabase()
        if client is None:
            return None
        result = (
            client.table(TABLE)
            .select("*")
            .eq("id", run_id)
            .single()
            .execute()
        )
        _table_exists = True
        return result.data
    except Exception as e:
        if _check_table_error(e):
            _table_exists = False
            _log_table_missing()
        else:
            print(f"[Supabase] Error fetching story run {run_id}: {e}")
        return None


async def delete_story_run(run_id: str) -> bool:
    """Delete a story run by ID."""
    global _table_exists
    if _table_exists is False:
        return False
    try:
        client = get_supabase()
        if client is None:
            return False
        client.table(TABLE).delete().eq("id", run_id).execute()
        print(f"[Supabase] Deleted story run: {run_id}")
        return True
    except Exception as e:
        if _check_table_error(e):
            _table_exists = False
            _log_table_missing()
        else:
            print(f"[Supabase] Error deleting story run {run_id}: {e}")
        return False
