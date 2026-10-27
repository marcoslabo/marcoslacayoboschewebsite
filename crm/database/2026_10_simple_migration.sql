-- ==========================================================================
-- Simpler CRM: 6 stages, built-in follow-up cadence, side always from list
--
-- Stages:  To contact → Messaged → Replied → Call booked → Demo → Won
--          plus Nurture and Not a Fit
-- Run ONCE in the Supabase SQL editor, right before deploying the matching
-- code. Safe to run again.
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. New columns
--    cadence_step: how many messages we've sent in the current sequence (0–4)
--    graded_at:    when they finished the Workflow Grader (shown as a badge)
--    activities.step: which message in the sequence an outreach was
-- --------------------------------------------------------------------------

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS cadence_step INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;

ALTER TABLE public.activities
    ADD COLUMN IF NOT EXISTS step INTEGER;

-- --------------------------------------------------------------------------
-- 2. Map stages. The stage-change triggers are paused so this doesn't add
--    hundreds of rows to the activity log.
-- --------------------------------------------------------------------------

ALTER TABLE public.contacts DISABLE TRIGGER contacts_stage_log;
ALTER TABLE public.contacts DISABLE TRIGGER contacts_stage_tracking;
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_status_check;

-- Graded people keep a badge
UPDATE public.contacts SET graded_at = coalesce(stage_changed_at, created_at)
WHERE status = 'Graded' AND graded_at IS NULL;

UPDATE public.contacts SET status = CASE
    -- Old event lists that were emailed months ago aren't in an active sequence
    WHEN status = 'Reached out' AND list IS NULL THEN 'Nurture'
    WHEN status = 'Reached out' THEN 'Messaged'
    WHEN status = 'Graded' THEN 'Replied'
    WHEN status IN ('Demo built', 'Demo reviewed') THEN 'Demo'
    WHEN status = 'Handed to Nymbl' THEN 'Won'
    ELSE status
END
WHERE status IN ('Reached out', 'Graded', 'Demo built', 'Demo reviewed', 'Handed to Nymbl');

-- People already messaged from a list are on step 1 of the sequence
UPDATE public.contacts SET cadence_step = 1 WHERE status = 'Messaged' AND cadence_step = 0;

-- Keep the stage history (weekly funnel) on the same names
UPDATE public.activities SET stage = CASE
    WHEN stage = 'Reached out' THEN 'Messaged'
    WHEN stage = 'Graded' THEN 'Replied'
    WHEN stage IN ('Demo built', 'Demo reviewed') THEN 'Demo'
    WHEN stage = 'Handed to Nymbl' THEN 'Won'
    ELSE stage
END
WHERE activity_type = 'stage' AND stage IN ('Reached out', 'Graded', 'Demo built', 'Demo reviewed', 'Handed to Nymbl');

ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_check CHECK (status IN (
    'To contact', 'Messaged', 'Replied', 'Call booked', 'Demo', 'Won', 'Nurture', 'Not a Fit'
));
ALTER TABLE public.contacts ALTER COLUMN status SET DEFAULT 'To contact';

ALTER TABLE public.contacts ENABLE TRIGGER contacts_stage_log;
ALTER TABLE public.contacts ENABLE TRIGGER contacts_stage_tracking;

-- --------------------------------------------------------------------------
-- 3. Side always comes from the list: a contact on a personal list
--    (Aló, KeepMedCover, any non-Nymbl project) is Personal. No list = Nymbl.
-- --------------------------------------------------------------------------

UPDATE public.contacts c SET side = l.side
FROM public.crm_lists l
WHERE c.list = l.name AND c.side IS DISTINCT FROM l.side;

UPDATE public.contacts SET side = 'nymbl' WHERE side IS NULL;

CREATE OR REPLACE FUNCTION public.contacts_side_from_list()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.list IS NOT NULL THEN
        SELECT side INTO NEW.side FROM public.crm_lists WHERE name = NEW.list;
    END IF;
    IF NEW.side IS NULL THEN
        NEW.side := 'nymbl';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_side_from_list ON public.contacts;
CREATE TRIGGER contacts_side_from_list
    BEFORE INSERT OR UPDATE OF list, side ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.contacts_side_from_list();

-- Changing a list's side in Settings moves its contacts too
CREATE OR REPLACE FUNCTION public.crm_lists_side_to_contacts()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.side IS DISTINCT FROM OLD.side THEN
        UPDATE public.contacts SET side = NEW.side WHERE list = NEW.name;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_lists_side_to_contacts ON public.crm_lists;
CREATE TRIGGER crm_lists_side_to_contacts
    AFTER UPDATE OF side ON public.crm_lists
    FOR EACH ROW EXECUTE FUNCTION public.crm_lists_side_to_contacts();

CREATE INDEX IF NOT EXISTS contacts_today_idx ON public.contacts (side, status, next_action_date);

COMMIT;

-- Check
-- SELECT side, status, count(*) FROM public.contacts GROUP BY 1, 2 ORDER BY 1, 2;
