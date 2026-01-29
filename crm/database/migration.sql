-- ==========================================================================
-- CRM Schema Migration
-- Run this in your Supabase SQL Editor to add CRM fields to existing tables
-- ==========================================================================

-- Add CRM-specific columns to contacts table
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'New' 
    CHECK (status IN ('New', 'Active', 'Won', 'Lost', 'Nurture'));

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS next_action TEXT 
    CHECK (next_action IN ('Call', 'Email', 'Follow Up', 'None'));

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS next_action_date DATE;

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS problem TEXT;

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS brevo_tag TEXT;

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS brevo_synced BOOLEAN DEFAULT FALSE;

ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Update source constraint to include new options
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_source_check;
ALTER TABLE contacts ADD CONSTRAINT contacts_source_check 
    CHECK (source IN (
        'Website (Spark)', 
        'Direct Call', 
        'Referral', 
        'LinkedIn', 
        'Event', 
        'Met In Person',
        'Clay Import',
        'Other'
    ));

-- Create trigger for updated_at on contacts
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_updated_at ON contacts;
CREATE TRIGGER contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_contacts_updated_at();

-- ==========================================================================
-- Useful Views for CRM
-- ==========================================================================

-- View: contacts with company name for CRM dashboard
CREATE OR REPLACE VIEW contacts_crm AS
SELECT 
    c.*,
    co.name as company_name,
    co.industry as company_industry,
    CASE 
        WHEN c.next_action_date < CURRENT_DATE THEN 'overdue'
        WHEN c.next_action_date = CURRENT_DATE THEN 'today'
        WHEN c.next_action_date = CURRENT_DATE + 1 THEN 'tomorrow'
        ELSE 'future'
    END as action_urgency,
    CURRENT_DATE - c.next_action_date as days_overdue
FROM contacts c
LEFT JOIN companies co ON c.company_id = co.id;

-- View: today's actions for dashboard
CREATE OR REPLACE VIEW todays_actions AS
SELECT 
    c.*,
    co.name as company_name
FROM contacts c
LEFT JOIN companies co ON c.company_id = co.id
WHERE c.next_action IS NOT NULL 
  AND c.next_action != 'None'
  AND c.next_action_date <= CURRENT_DATE
ORDER BY 
    CASE WHEN c.next_action_date < CURRENT_DATE THEN 0 ELSE 1 END,
    c.next_action_date ASC,
    c.next_action ASC;

-- ==========================================================================
-- Activities Table - Log every interaction with contacts
-- ==========================================================================

CREATE TABLE IF NOT EXISTS activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    
    -- What type of activity
    activity_type TEXT NOT NULL CHECK (activity_type IN (
        'call',
        'email', 
        'meeting',
        'linkedin_message',
        'note',
        'status_change'
    )),
    
    -- Outcome of the activity
    outcome TEXT CHECK (outcome IN (
        -- Call outcomes
        'no_answer',
        'left_voicemail',
        'connected',
        'scheduled_meeting',
        'not_interested',
        -- Email outcomes
        'sent',
        'replied',
        'bounced',
        -- Meeting outcomes
        'completed',
        'no_show',
        'rescheduled',
        -- General
        'other'
    )),
    
    -- Details
    notes TEXT,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast queries by contact
CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_activities_created_at ON activities(created_at DESC);

-- Enable RLS
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- Allow public access (same as contacts table)
CREATE POLICY IF NOT EXISTS "Allow all access to activities" ON activities
    FOR ALL USING (true) WITH CHECK (true);
