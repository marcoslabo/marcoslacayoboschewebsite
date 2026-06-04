-- ==========================================================================
-- NPI Grader (Workflow Risk Score) Migration
-- Run in Supabase SQL Editor.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS grader_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NPI lookup data
    practice_name TEXT,
    npi_number TEXT,
    practice_metadata JSONB,   -- raw NPI/CMS data we keep for context
    fallback_specialty TEXT,   -- when NPI lookup not used, the dropdown choice

    -- Claude-generated risk profile
    risk_score INTEGER,        -- 0-100
    risk_grade TEXT,           -- A / B / C / D / F
    risk_breakdown JSONB,      -- {automation:0-20, integration:0-20, vendor_lock_in:0-20, ai_readiness:0-20, patient_impact:0-20}
    top_patterns JSONB,        -- [{title, why_it_applies, fix}, ...]
    headline TEXT,             -- one-line summary "You scored XX — Vendor Trapped"

    -- Lead capture
    email TEXT,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grader_submissions_email ON grader_submissions(email);
CREATE INDEX IF NOT EXISTS idx_grader_submissions_created ON grader_submissions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_grader_submissions_npi ON grader_submissions(npi_number);

ALTER TABLE grader_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for grader_submissions" ON grader_submissions;
CREATE POLICY "Allow all for grader_submissions" ON grader_submissions
    FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION update_grader_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS grader_submissions_updated_at ON grader_submissions;
CREATE TRIGGER grader_submissions_updated_at
    BEFORE UPDATE ON grader_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_grader_submissions_updated_at();

-- Verification:
-- SELECT count(*) FROM grader_submissions;
