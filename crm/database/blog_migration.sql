-- ==========================================================================
-- Blog Posts Table Migration
-- Run this in Supabase SQL Editor
-- ==========================================================================

-- Create blog_posts table
CREATE TABLE IF NOT EXISTS blog_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    excerpt TEXT,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'ai-strategy' CHECK (category IN ('healthcare', 'private-equity', 'ai-strategy', 'case-study')),
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    author TEXT DEFAULT 'Marcos Bosche',
    read_time INTEGER DEFAULT 5,
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Allow public read access to published posts (for the website)
CREATE POLICY "Public can read published posts" ON blog_posts
    FOR SELECT USING (status = 'published');

-- Allow authenticated users full access (for CRM)
CREATE POLICY "Authenticated users can manage posts" ON blog_posts
    FOR ALL USING (true);

-- Create index on slug for fast lookups
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_status ON blog_posts (status);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts (published_at DESC);
