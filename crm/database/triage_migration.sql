-- ==========================================================================
-- Inbound Triage Migration
-- Run this in your Supabase SQL Editor.
--
-- Adds a contact_triage table that stores the agent's classification +
-- drafted reply for each inbound contact. One contact can have multiple
-- triage runs over time (history kept by created_at).
-- ==========================================================================

CREATE TABLE IF NOT EXISTS contact_triage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    brand_slug TEXT NOT NULL DEFAULT 'marcos' REFERENCES brands(slug),

    -- Classification
    segment TEXT,                                   -- e.g. 'radiology-group', 'hospital-system', 'pe-firm', 'healthcare', 'private-equity', 'ai-strategy', 'general', 'unknown'
    intent_score INTEGER CHECK (intent_score BETWEEN 1 AND 10),
    intent_reasoning TEXT,

    -- Drafted reply
    draft_subject TEXT,
    draft_body TEXT,

    -- Lifecycle
    sent BOOLEAN DEFAULT FALSE,
    sent_at TIMESTAMPTZ,
    notes TEXT,

    -- Metadata
    model TEXT,
    used_spark_brief BOOLEAN DEFAULT FALSE,         -- did the agent see a Spark brief?

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_triage_contact ON contact_triage(contact_id);
CREATE INDEX IF NOT EXISTS idx_triage_brand   ON contact_triage(brand_slug);
CREATE INDEX IF NOT EXISTS idx_triage_created ON contact_triage(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_triage_intent  ON contact_triage(intent_score DESC);

-- RLS — same permissive pattern as the rest of the CRM
ALTER TABLE contact_triage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for contact_triage" ON contact_triage;
CREATE POLICY "Allow all for contact_triage" ON contact_triage
    FOR ALL USING (true) WITH CHECK (true);

-- updated_at trigger (reuses pattern from earlier migrations)
CREATE OR REPLACE FUNCTION update_contact_triage_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contact_triage_updated_at ON contact_triage;
CREATE TRIGGER contact_triage_updated_at
    BEFORE UPDATE ON contact_triage
    FOR EACH ROW
    EXECUTE FUNCTION update_contact_triage_updated_at();

-- ==========================================================================
-- View: contacts with their LATEST triage joined in
-- Makes it cheap for the inbound view to query "untriaged" contacts.
-- ==========================================================================
CREATE OR REPLACE VIEW contacts_inbound AS
SELECT
    c.*,
    co.name      AS company_name,
    co.industry  AS company_industry,
    co.company_size,
    t.id              AS triage_id,
    t.segment         AS triage_segment,
    t.intent_score    AS triage_intent_score,
    t.intent_reasoning AS triage_intent_reasoning,
    t.draft_subject   AS triage_draft_subject,
    t.draft_body      AS triage_draft_body,
    t.sent            AS triage_sent,
    t.sent_at         AS triage_sent_at,
    t.created_at      AS triage_created_at,
    -- Spark brief if any (most recent)
    b.id              AS brief_id,
    b.problem_clean   AS brief_problem,
    b.solution_level  AS brief_solution_level,
    b.suggested_approach AS brief_approach,
    b.hours_per_week  AS brief_hours_per_week,
    b.people_involved AS brief_people_involved
FROM contacts c
LEFT JOIN companies co ON c.company_id = co.id
LEFT JOIN LATERAL (
    SELECT * FROM contact_triage
    WHERE contact_id = c.id
    ORDER BY created_at DESC LIMIT 1
) t ON TRUE
LEFT JOIN LATERAL (
    SELECT * FROM briefs
    WHERE contact_id = c.id
    ORDER BY created_at DESC LIMIT 1
) b ON TRUE;

-- ==========================================================================
-- Verification: should return 0 rows initially, then grow as you triage
--   SELECT count(*) FROM contact_triage;
-- View should return all contacts with their latest triage (or NULL if untriaged):
--   SELECT id, first_name, last_name, triage_segment, triage_intent_score
--   FROM contacts_inbound ORDER BY created_at DESC LIMIT 10;
-- ==========================================================================
