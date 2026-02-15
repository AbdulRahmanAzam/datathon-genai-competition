-- ============================================================================
-- Migration: Create story_runs table for NarrativeVerse
-- Description: Stores completed story generation runs with all events & metadata
-- ============================================================================

-- Create the main table
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

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_story_runs_created_at ON story_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_runs_title ON story_runs(title);

-- Enable Row Level Security
ALTER TABLE story_runs ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all operations (adjust based on your auth requirements)
DROP POLICY IF EXISTS "Allow all operations" ON story_runs;
CREATE POLICY "Allow all operations" 
ON story_runs 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Add helpful comment
COMMENT ON TABLE story_runs IS 'Stores NarrativeVerse story generation runs with full event timeline';
COMMENT ON COLUMN story_runs.characters IS 'Array of character profiles with name and description';
COMMENT ON COLUMN story_runs.events IS 'Array of all story events (dialogue, actions, narration)';
COMMENT ON COLUMN story_runs.timeline IS 'Turn-by-turn timeline data for visualization';
COMMENT ON COLUMN story_runs.summary IS 'Story statistics and metadata';
