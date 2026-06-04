-- ==========================================================================
-- Discovery Config — single-row table holding user-editable focus topics
-- that steer the viral-discovery cron (YT search queries + Claude scoring).
-- Run in Supabase SQL Editor.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS discovery_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    focus_topics TEXT[] DEFAULT '{}',
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT discovery_config_singleton CHECK (id = 1)
);

-- Seed empty config
INSERT INTO discovery_config (id, focus_topics)
VALUES (1, '{}')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE discovery_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for discovery_config" ON discovery_config;
CREATE POLICY "Allow all for discovery_config" ON discovery_config
    FOR ALL USING (true) WITH CHECK (true);

-- Verification:
-- SELECT id, focus_topics FROM discovery_config;
