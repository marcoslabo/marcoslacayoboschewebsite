-- ==========================================================================
-- Owner-Based Data Separation Migration
-- Run this in your Supabase SQL Editor
-- ==========================================================================

-- Add owner column to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'marcos';

-- Add owner column to activities table
ALTER TABLE activities
ADD COLUMN IF NOT EXISTS owner TEXT NOT NULL DEFAULT 'marcos';

-- Set all existing contacts to marcos (your data)
UPDATE contacts SET owner = 'marcos' WHERE owner IS NULL OR owner = 'marcos';

-- Set all existing activities to marcos
UPDATE activities SET owner = 'marcos' WHERE owner IS NULL OR owner = 'marcos';

-- Add indexes for fast owner-based queries
CREATE INDEX IF NOT EXISTS idx_contacts_owner ON contacts(owner);
CREATE INDEX IF NOT EXISTS idx_activities_owner ON activities(owner);
