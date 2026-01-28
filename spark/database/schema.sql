-- ==========================================================================
-- Spark Database Schema for Supabase
-- Run this in your Supabase SQL Editor
-- ==========================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================================================
-- Table: companies
-- ==========================================================================
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    industry TEXT CHECK (industry IN (
        'Healthcare', 
        'Financial Services', 
        'Manufacturing', 
        'Consulting', 
        'Private Equity', 
        'Technology', 
        'Retail', 
        'Energy', 
        'Other'
    )),
    company_size TEXT CHECK (company_size IN (
        '1-50', 
        '51-200', 
        '201-500', 
        '501-1000', 
        '1000-5000', 
        '5000+'
    )),
    website TEXT,
    status TEXT DEFAULT 'Prospect' CHECK (status IN (
        'Prospect', 
        'Active Client', 
        'Past Client', 
        'Lost'
    )),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- Table: contacts
-- ==========================================================================
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    job_title TEXT,
    linkedin_url TEXT,
    source TEXT CHECK (source IN (
        'Website (Spark)', 
        'Direct Call', 
        'Referral', 
        'LinkedIn', 
        'Event', 
        'Other'
    )),
    is_lead BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- Table: briefs
-- ==========================================================================
CREATE TABLE briefs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT,
    company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    
    -- Problem details
    problem_raw TEXT,
    problem_clean TEXT,
    current_process TEXT,
    department TEXT CHECK (department IN (
        'Operations', 
        'Finance', 
        'Clinical', 
        'IT', 
        'HR', 
        'Sales', 
        'Marketing', 
        'Legal', 
        'Other'
    )),
    
    -- Effort metrics
    hours_per_week NUMERIC,
    people_involved INTEGER,
    hourly_rate NUMERIC DEFAULT 50,
    improvement_percent NUMERIC DEFAULT 80,
    
    -- AI-generated fields
    solution_level TEXT CHECK (solution_level IN (
        'Level 1 - Existing Tools', 
        'Level 2 - Workflow Integration', 
        'Level 3 - Custom Development'
    )),
    level_reasoning TEXT,
    suggested_approach TEXT,
    
    -- Status and sharing
    status TEXT DEFAULT 'Draft' CHECK (status IN (
        'Draft', 
        'Shared', 
        'Qualified', 
        'In Progress', 
        'Deployed', 
        'Measuring', 
        'Closed Lost'
    )),
    share_id TEXT UNIQUE,
    share_link_views INTEGER DEFAULT 0,
    
    -- Metadata
    created_by TEXT DEFAULT 'Marcos' CHECK (created_by IN ('Marcos', 'Website (Public)')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- Table: results (for tracking actual outcomes)
-- ==========================================================================
CREATE TABLE results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brief_id UUID REFERENCES briefs(id) ON DELETE CASCADE,
    deployed_date DATE,
    actual_hours_saved_weekly NUMERIC,
    qualitative_feedback TEXT,
    lessons_learned TEXT,
    usable_as_case_study BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- Table: activity_log (for tracking interactions)
-- ==========================================================================
CREATE TABLE activity_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brief_id UUID REFERENCES briefs(id) ON DELETE CASCADE,
    activity_type TEXT CHECK (activity_type IN (
        'Created', 
        'Edited', 
        'Shared', 
        'Link Viewed', 
        'Status Changed', 
        'Results Logged'
    )),
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================================
-- Row Level Security (RLS) Policies
-- For now, allow all operations (Marcos-only access)
-- ==========================================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE results ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated and anon users (simplest setup)
-- In production, you'd want more restrictive policies
CREATE POLICY "Allow all for companies" ON companies FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for contacts" ON contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for briefs" ON briefs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for results" ON results FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for activity_log" ON activity_log FOR ALL USING (true) WITH CHECK (true);

-- ==========================================================================
-- Useful Views
-- ==========================================================================

-- View: briefs with calculated ROI
CREATE OR REPLACE VIEW briefs_with_roi AS
SELECT 
    b.*,
    c.name as company_name,
    c.industry as company_industry,
    ct.first_name || ' ' || ct.last_name as contact_name,
    ct.email as contact_email,
    -- Calculate annual current cost
    COALESCE(b.hours_per_week, 0) * COALESCE(b.people_involved, 1) * COALESCE(b.hourly_rate, 50) * 52 as annual_current_cost,
    -- Calculate annual potential savings
    COALESCE(b.hours_per_week, 0) * COALESCE(b.people_involved, 1) * COALESCE(b.hourly_rate, 50) * 52 * (COALESCE(b.improvement_percent, 80) / 100) as annual_potential_savings
FROM briefs b
LEFT JOIN companies c ON b.company_id = c.id
LEFT JOIN contacts ct ON b.contact_id = ct.id;

-- ==========================================================================
-- Trigger: Auto-update updated_at on briefs
-- ==========================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER briefs_updated_at
    BEFORE UPDATE ON briefs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ==========================================================================
-- Sample Data (for testing)
-- ==========================================================================
-- Uncomment to insert sample data

/*
-- Sample Company
INSERT INTO companies (name, industry, company_size, status)
VALUES ('Regional Radiology Network', 'Healthcare', '201-500', 'Prospect');

-- Sample Contact
INSERT INTO contacts (first_name, last_name, email, job_title, company_id, source)
SELECT 'Sarah', 'Chen', 'sarah.chen@example.com', 'VP Operations', id, 'Direct Call'
FROM companies WHERE name = 'Regional Radiology Network';

-- Sample Brief
INSERT INTO briefs (
    title, 
    company_id, 
    contact_id, 
    problem_raw, 
    problem_clean,
    hours_per_week,
    people_involved,
    hourly_rate,
    improvement_percent,
    solution_level,
    suggested_approach,
    status
)
SELECT 
    'Fax Processing Automation',
    c.id,
    ct.id,
    'faxes everywhere, nurses typing into epic all day, errors, slow, they hate it',
    'The organization receives thousands of inbound faxes daily containing clinical orders. Staff must manually enter this data into the Epic EMR system, a time-consuming process that creates frustration, delays patient care, and introduces potential for data entry errors.',
    120,
    6,
    45,
    90,
    'Level 3 - Custom Development',
    'We would implement an AI-powered intelligent document processing system using OCR and machine learning to automatically extract data from faxes and route orders via HL7 directly to Epic.',
    'Draft'
FROM companies c
JOIN contacts ct ON ct.company_id = c.id
WHERE c.name = 'Regional Radiology Network';
*/
