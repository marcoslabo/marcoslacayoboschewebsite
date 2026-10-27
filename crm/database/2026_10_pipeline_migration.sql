-- ==========================================================================
-- CRM pipeline: top-of-funnel stages, new sources, stage tracking
--
-- Run ONCE in the Supabase SQL editor, right after
-- 2026_10_security_migration.sql and before deploying the matching code.
--
-- The contacts.status column keeps its name; it now holds the stage.
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. New columns
-- --------------------------------------------------------------------------

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS stage_changed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS utm_source TEXT,
    ADD COLUMN IF NOT EXISTS utm_campaign TEXT;

-- Which stage a 'stage' activity moved the contact into (powers the weekly funnel)
ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS stage TEXT;

-- --------------------------------------------------------------------------
-- 2. Drop the old status/source/activity_type CHECK constraints
--    (names differ between environments, so find them by definition)
-- --------------------------------------------------------------------------

DO $$
DECLARE c RECORD;
BEGIN
    FOR c IN
        SELECT conrelid::regclass AS tbl, conname
        FROM pg_constraint
        WHERE contype = 'c'
          AND (
                (conrelid = 'public.contacts'::regclass
                    AND (pg_get_constraintdef(oid) ILIKE '%status%' OR pg_get_constraintdef(oid) ILIKE '%source%'))
             OR (conrelid = 'public.activities'::regclass
                    AND pg_get_constraintdef(oid) ILIKE '%activity_type%')
          )
    LOOP
        EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', c.tbl, c.conname);
    END LOOP;
END $$;

-- --------------------------------------------------------------------------
-- 3. Map old statuses to stages
--    New     → Reached out
--    Active  → Call booked if a meeting was logged, otherwise Replied
--    Won     → Handed to Nymbl
--    Lost    → Nurture
--    Nurture, Not a Fit → unchanged
-- --------------------------------------------------------------------------

UPDATE public.contacts c SET status = CASE
    WHEN c.status = 'New' THEN 'Reached out'
    WHEN c.status = 'Active' AND EXISTS (
        SELECT 1 FROM public.activities a
        WHERE a.contact_id = c.id
          AND (a.activity_type = 'meeting' OR a.outcome = 'scheduled_meeting')
    ) THEN 'Call booked'
    WHEN c.status = 'Active' THEN 'Replied'
    WHEN c.status = 'Won' THEN 'Handed to Nymbl'
    WHEN c.status = 'Lost' THEN 'Nurture'
    WHEN c.status IS NULL THEN 'Reached out'
    ELSE c.status
END;

-- --------------------------------------------------------------------------
-- 4. Map old sources
--    LinkedIn → LinkedIn outreach · Website (Spark) → Grader
--    Event, Direct Call, Met In Person, Clay Import → Other
-- --------------------------------------------------------------------------

UPDATE public.contacts SET source = CASE
    WHEN source = 'LinkedIn' THEN 'LinkedIn outreach'
    WHEN source = 'Website (Spark)' THEN 'Grader'
    WHEN source IN ('Grader', 'LinkedIn post', 'LinkedIn outreach', 'Newsletter', 'Referral', 'Other') THEN source
    ELSE 'Other'
END;

UPDATE public.contacts SET stage_changed_at = coalesce(updated_at, created_at) WHERE stage_changed_at IS NULL;

-- --------------------------------------------------------------------------
-- 5. New constraints
-- --------------------------------------------------------------------------

ALTER TABLE public.contacts
    ALTER COLUMN status SET DEFAULT 'Reached out',
    ALTER COLUMN stage_changed_at SET DEFAULT now(),
    ADD CONSTRAINT contacts_status_check CHECK (status IN (
        'Reached out', 'Replied', 'Graded', 'Call booked', 'Demo built',
        'Demo reviewed', 'Handed to Nymbl', 'Nurture', 'Not a Fit'
    )),
    ADD CONSTRAINT contacts_source_check CHECK (source IS NULL OR source IN (
        'Grader', 'LinkedIn post', 'LinkedIn outreach', 'Newsletter', 'Referral', 'Other'
    ));

ALTER TABLE public.activities
    ADD CONSTRAINT activities_activity_type_check CHECK (activity_type IN (
        'call', 'email', 'meeting', 'note', 'linkedin', 'outreach', 'stage'
    ));

-- --------------------------------------------------------------------------
-- 6. Every stage change stamps stage_changed_at and logs a 'stage' activity,
--    whether it comes from the CRM, the Grader, the newsletter or an import.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.contacts_stage_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        NEW.stage_changed_at := now();
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.contacts_stage_log()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.activities (contact_id, activity_type, stage, notes, owner)
        VALUES (
            NEW.id, 'stage', NEW.status,
            CASE WHEN TG_OP = 'INSERT' THEN 'Added as ' || NEW.status
                 ELSE coalesce(OLD.status, '—') || ' → ' || NEW.status END,
            NEW.owner
        );
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS contacts_stage_tracking ON public.contacts;
CREATE TRIGGER contacts_stage_tracking
    BEFORE INSERT OR UPDATE OF status ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.contacts_stage_tracking();

DROP TRIGGER IF EXISTS contacts_stage_log ON public.contacts;
CREATE TRIGGER contacts_stage_log
    AFTER INSERT OR UPDATE OF status ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.contacts_stage_log();

CREATE INDEX IF NOT EXISTS activities_type_created_idx ON public.activities (activity_type, created_at);

COMMIT;

-- Check: stage counts after the mapping
-- SELECT status, count(*) FROM public.contacts GROUP BY status ORDER BY 2 DESC;
