-- ==========================================================================
-- Weekly Todos Migration
-- Run this in your Supabase SQL Editor.
--
-- Adds a weekly_todos table for managing weekly content cadence.
-- Templates (is_template=TRUE, week_start=NULL) are recurring patterns.
-- Week instances (is_template=FALSE) are copies tied to a specific Monday.
-- ==========================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS weekly_todos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start DATE,
    day_of_week TEXT CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    title TEXT NOT NULL,
    description TEXT,
    category TEXT CHECK (category IN ('record','edit','publish','comment','plan','other')),
    is_done BOOLEAN DEFAULT FALSE,
    done_at TIMESTAMPTZ,
    is_template BOOLEAN DEFAULT FALSE,
    order_index INTEGER DEFAULT 0,
    brand_slug TEXT DEFAULT 'marcos' REFERENCES brands(slug),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_weekly_todos_week_start ON weekly_todos(week_start);
CREATE INDEX IF NOT EXISTS idx_weekly_todos_template ON weekly_todos(is_template);
CREATE INDEX IF NOT EXISTS idx_weekly_todos_brand ON weekly_todos(brand_slug);

-- 3. updated_at trigger
CREATE OR REPLACE FUNCTION update_weekly_todos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS weekly_todos_updated_at ON weekly_todos;
CREATE TRIGGER weekly_todos_updated_at
    BEFORE UPDATE ON weekly_todos
    FOR EACH ROW
    EXECUTE FUNCTION update_weekly_todos_updated_at();

-- 4. RLS
ALTER TABLE weekly_todos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for weekly_todos" ON weekly_todos;
CREATE POLICY "Allow all for weekly_todos" ON weekly_todos
    FOR ALL USING (true) WITH CHECK (true);

-- ==========================================================================
-- 5. Seed template todos
-- Safe to re-run: clears existing marcos-brand templates first.
-- ==========================================================================
DELETE FROM weekly_todos WHERE is_template = TRUE AND brand_slug = 'marcos';

INSERT INTO weekly_todos (day_of_week, title, description, category, is_template, order_index, brand_slug) VALUES
-- Monday — record
('monday', 'Batch record session (4 hours)', '1 long video (5-10 min) + 3 short videos (90 sec each)', 'record', TRUE, 0, 'marcos'),
('monday', '30 min ICP commenting', '5-10 substantive comments on healthcare executive posts from the 50-person list', 'comment', TRUE, 1, 'marcos'),

-- Tuesday — edit
('tuesday', 'Edit long video in Descript', 'Upload to YouTube as unlisted', 'edit', TRUE, 0, 'marcos'),
('tuesday', 'Run long transcript through CRM agent pipeline', 'Auto-generates blog/LinkedIn/email', 'edit', TRUE, 1, 'marcos'),
('tuesday', 'Edit 3 shorts in CapCut', NULL, 'edit', TRUE, 2, 'marcos'),
('tuesday', '30 min ICP commenting', '5-10 substantive comments on healthcare executive posts from the 50-person list', 'comment', TRUE, 3, 'marcos'),

-- Wednesday — publish (the big drop)
('wednesday', '9am ET: YouTube video goes public', NULL, 'publish', TRUE, 0, 'marcos'),
('wednesday', '9am ET: Post text-only LinkedIn long-form (Marcos personal)', 'YouTube link goes in FIRST COMMENT under post, NOT in body (LinkedIn demotes external links)', 'publish', TRUE, 1, 'marcos'),
('wednesday', '9:05am ET: VytalMed company page reposts', NULL, 'publish', TRUE, 2, 'marcos'),
('wednesday', '11am ET: Brevo email blast', NULL, 'publish', TRUE, 3, 'marcos'),
('wednesday', 'Reply to every comment within first 60 min', NULL, 'publish', TRUE, 4, 'marcos'),
('wednesday', '30 min ICP commenting', '5-10 substantive comments on healthcare executive posts from the 50-person list', 'comment', TRUE, 5, 'marcos'),

-- Thursday — curated + monthly carousel
('thursday', '9am ET: Post curated industry article + your take on Marcos LinkedIn', 'Text post, no external link in body', 'publish', TRUE, 0, 'marcos'),
('thursday', '30 min ICP commenting', '5-10 substantive comments on healthcare executive posts from the 50-person list', 'comment', TRUE, 1, 'marcos'),
('thursday', 'MONTHLY: Build + post 6-slide carousel (PDF from Canva)', 'List-style topic. Carousels currently outperform every other LinkedIn format. Delete this todo on weeks it does not apply.', 'other', TRUE, 2, 'marcos'),

-- Friday — short video
('friday', '9am ET: Upload 90-sec MP4 NATIVELY to LinkedIn', 'Not as YouTube link — native video gets algorithmic boost', 'publish', TRUE, 0, 'marcos'),
('friday', 'VytalMed page reposts', NULL, 'publish', TRUE, 1, 'marcos'),
('friday', '30 min ICP commenting', '5-10 substantive comments on healthcare executive posts from the 50-person list', 'comment', TRUE, 2, 'marcos'),

-- Sunday — plan
('sunday', 'Pick next Monday''s recording topic from 40-topic backlog', NULL, 'plan', TRUE, 0, 'marcos'),
('sunday', 'Review week''s engagement', 'Profile visits, comments, new connections', 'plan', TRUE, 1, 'marcos'),
('sunday', 'Update ICP CSV', 'Swap non-engagers, add new', 'plan', TRUE, 2, 'marcos');

-- ==========================================================================
-- Verification query — run after seeding to confirm 21 rows + correct order
-- ==========================================================================
-- SELECT
--     CASE day_of_week
--         WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2 WHEN 'wednesday' THEN 3
--         WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5 WHEN 'saturday' THEN 6 WHEN 'sunday' THEN 7
--     END AS dow_num,
--     day_of_week, order_index, category, title
-- FROM weekly_todos
-- WHERE is_template = TRUE AND brand_slug = 'marcos'
-- ORDER BY dow_num, order_index;
