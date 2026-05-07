-- ==========================================================================
-- Brands Migration — Multi-Brand Sales OS Foundation
-- Run this in your Supabase SQL Editor.
--
-- Adds a `brands` table and a `brand_slug` column to every entity that has
-- a clear single-brand owner: contacts, blog_posts, activities, briefs.
--
-- Companies are intentionally NOT branded — the same company can be a target
-- for both Marcos and VytalMed. Brand attribution lives on the action records.
--
-- Existing rows default to brand_slug = 'marcos' so nothing breaks.
-- ==========================================================================

-- 1. Brands lookup table
CREATE TABLE IF NOT EXISTS brands (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    domain TEXT,
    sender_name TEXT,
    sender_email TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Seed the two brands
INSERT INTO brands (slug, name, domain, sender_name, sender_email) VALUES
    ('marcos',   'Marcos Lacayo Bosche', 'marcoslacayobosche.com', 'Marcos Bosche', 'marcos@marcoslacayobosche.com'),
    ('vytalmed', 'VytalMed',             'vytalmed.co',           'VytalMed',       'hello@vytalmed.co')
ON CONFLICT (slug) DO NOTHING;

-- 3. Add brand_slug to contacts
ALTER TABLE contacts
    ADD COLUMN IF NOT EXISTS brand_slug TEXT DEFAULT 'marcos' REFERENCES brands(slug);
CREATE INDEX IF NOT EXISTS idx_contacts_brand ON contacts(brand_slug);

-- 4. Add brand_slug to blog_posts
ALTER TABLE blog_posts
    ADD COLUMN IF NOT EXISTS brand_slug TEXT DEFAULT 'marcos' REFERENCES brands(slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_brand ON blog_posts(brand_slug);

-- 5. Add brand_slug to activities
ALTER TABLE activities
    ADD COLUMN IF NOT EXISTS brand_slug TEXT DEFAULT 'marcos' REFERENCES brands(slug);
CREATE INDEX IF NOT EXISTS idx_activities_brand ON activities(brand_slug);

-- 6. Add brand_slug to briefs (Spark)
ALTER TABLE briefs
    ADD COLUMN IF NOT EXISTS brand_slug TEXT DEFAULT 'marcos' REFERENCES brands(slug);
CREATE INDEX IF NOT EXISTS idx_briefs_brand ON briefs(brand_slug);

-- 7. RLS for brands
ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for brands" ON brands;
CREATE POLICY "Allow all for brands" ON brands
    FOR ALL USING (true) WITH CHECK (true);

-- 8. Convenience view: contacts with brand info
CREATE OR REPLACE VIEW contacts_with_brand AS
SELECT
    c.*,
    b.name   AS brand_name,
    b.domain AS brand_domain
FROM contacts c
LEFT JOIN brands b ON c.brand_slug = b.slug;

-- ==========================================================================
-- After running:
--   SELECT slug, name, domain FROM brands;
-- Should return both 'marcos' and 'vytalmed'.
-- ==========================================================================
