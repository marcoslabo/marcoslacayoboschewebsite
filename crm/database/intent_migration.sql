-- ==========================================================================
-- CRM Schema Migration - Intent Fields + Event Tagging
-- Run this in your Supabase SQL Editor
-- ==========================================================================

-- Add intent tracking columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS intent_reason TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_links TEXT;

-- Add event tag column for grouping contacts by event/campaign
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS event_tag TEXT;

-- Optional: Create index for faster event filtering
CREATE INDEX IF NOT EXISTS idx_contacts_event_tag ON contacts(event_tag);

-- Update activity type constraint to include 'linkedin'
ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_activity_type_check;
ALTER TABLE activities ADD CONSTRAINT activities_activity_type_check 
    CHECK (activity_type IN ('call', 'email', 'meeting', 'note', 'linkedin'));
