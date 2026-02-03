-- ==========================================================================
-- CRM Schema Migration - Intent Fields
-- Run this in your Supabase SQL Editor
-- ==========================================================================

-- Add intent tracking columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS intent_reason TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS source_links TEXT;

-- Delete existing contacts to allow fresh import
-- (User requested this)
DELETE FROM contacts;
DELETE FROM companies;
