-- ==========================================================================
-- Viral Discovery + Post Draft Pipeline
-- Run in Supabase SQL Editor.
-- ==========================================================================

-- 1. POV Pillars — the 12 deck statements that anchor every draft
CREATE TABLE IF NOT EXISTS pov_pillars (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    statement TEXT NOT NULL,
    voice_notes TEXT,
    order_index INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Viral inputs from RSS + Reddit
CREATE TABLE IF NOT EXISTS viral_inputs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT,                       -- 'rss' | 'reddit'
    source_name TEXT,                  -- 'Becker''s', 'r/Radiology', etc.
    url TEXT UNIQUE,
    title TEXT,
    excerpt TEXT,
    published_at TIMESTAMPTZ,
    engagement_signal INTEGER,         -- reddit upvotes, or null for RSS
    claude_score INTEGER,              -- 0-100 alignment
    claude_alignment_pillar TEXT,      -- pillar slug it matches best
    claude_summary TEXT,               -- one-liner from Claude
    status TEXT DEFAULT 'new' CHECK (status IN ('new', 'archived', 'drafted')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_viral_inputs_status_score ON viral_inputs(status, claude_score DESC);
CREATE INDEX IF NOT EXISTS idx_viral_inputs_created ON viral_inputs(created_at DESC);

-- 3. Post drafts (3 angles per viral input)
CREATE TABLE IF NOT EXISTS post_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    viral_input_id UUID REFERENCES viral_inputs(id) ON DELETE CASCADE,
    pov_pillar_slug TEXT,
    angle TEXT,                        -- 'operator-perspective' | 'contrarian' | 'case-study-tie-in'
    draft_text TEXT,
    edited_text TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'posted', 'archived')),
    posted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_drafts_viral ON post_drafts(viral_input_id);

-- RLS
ALTER TABLE pov_pillars   ENABLE ROW LEVEL SECURITY;
ALTER TABLE viral_inputs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_drafts   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for pov_pillars" ON pov_pillars;
DROP POLICY IF EXISTS "Allow all for viral_inputs" ON viral_inputs;
DROP POLICY IF EXISTS "Allow all for post_drafts" ON post_drafts;
CREATE POLICY "Allow all for pov_pillars"  ON pov_pillars  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for viral_inputs" ON viral_inputs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for post_drafts"  ON post_drafts  FOR ALL USING (true) WITH CHECK (true);

-- ==========================================================================
-- Seed: 12 POV pillars from the VytalMed pitch deck
-- ==========================================================================
DELETE FROM pov_pillars WHERE slug LIKE 'deck-%';

INSERT INTO pov_pillars (slug, statement, voice_notes, order_index) VALUES
('deck-1',  'Most dev shops don''t understand healthcare. We only build healthcare. That''s the difference. That''s the whole thing.',
            'Direct, declarative, no hedging. Healthcare specialization as identity.', 1),
('deck-2',  'Not a SaaS platform. Not a consultancy. A dev team that compounds.',
            'Define what VytalMed ISN''T first. Compounding = healthcare-specific learning carries forward.', 2),
('deck-3',  'By week 5, you''re iterating. Not deciding.',
            'Time-anchored promise. Frames the prospect''s current pain (still deciding) vs the future state.', 3),
('deck-4',  'Most dev shops are still scoping at week 5. We''re already shipping.',
            'Comparison-based. Anti-vendor jab. Specific time = credibility.', 4),
('deck-5',  'Specialization compounds. Generalists pay tuition every project.',
            'Reframes "we''re generalists" as a cost the buyer pays. Sharp.', 5),
('deck-6',  '80% of our clients ship in 80 days.',
            'Specific metric, easy to remember. Use as proof point.', 6),
('deck-7',  'Start with 4-5 weeks. Build for years.',
            'Phase 1 + Phase 2/3 in one line. De-risks the entry.', 7),
('deck-8',  'Every delayed intake delays diagnosis.',
            'Clinical/emotional weight. Connects ops dysfunction to patient harm.', 8),
('deck-9',  'AI alone doesn''t fix a broken workflow.',
            'Anti-hype. Positions VytalMed as the integration layer, not another AI vendor.', 9),
('deck-10', 'Staff spend hours on work that should be automated.',
            'Operator empathy. Names the dignity problem (not just the cost).', 10),
('deck-11', 'Every system speaks a different language.',
            'Integration burden. HL7/FHIR/DICOM credibility hook.', 11),
('deck-12', 'SaaS ships 60% of a solution — you adjust to the software, not the other way around.',
            'The vendor-trap claim. Core thesis. Best for posts about specific SaaS frustration.', 12);

-- Verification:
-- SELECT slug, statement FROM pov_pillars ORDER BY order_index;
