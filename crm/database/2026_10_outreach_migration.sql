-- ==========================================================================
-- CRM outreach workspace: sides, lists, priorities, "To contact" stage
--
-- Run ONCE in the Supabase SQL editor, right before deploying the matching
-- code. Safe to run again.
-- ==========================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- 1. Lists (editable in CRM → Settings). Each list belongs to a side and
--    carries the message template used by "Draft message".
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_lists (
    name       TEXT PRIMARY KEY,
    side       TEXT NOT NULL CHECK (side IN ('nymbl', 'personal')),
    template   TEXT NOT NULL DEFAULT '',
    sort       INTEGER NOT NULL DEFAULT 100,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.crm_lists ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_lists FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_lists TO authenticated;
DROP POLICY IF EXISTS "CRM users only" ON public.crm_lists;
CREATE POLICY "CRM users only" ON public.crm_lists FOR ALL TO authenticated
    USING (public.is_crm_user()) WITH CHECK (public.is_crm_user());

INSERT INTO public.crm_lists (name, side, sort, template) VALUES
('Nymbl – VytalMed', 'nymbl', 10,
'Casual, 2 to 4 sentences, first person, like a note from one operator to another.
1. Their likely workflow headache, in plain words, based on their title, organization and notes.
2. One line of proof: we built AI for a large radiology group: 3M+ reads a year, projected $3.5M a year in software savings.
3. The offer: "Want me to build you a free working demo of that? No access to your systems needed."
4. End with a light question.
Never name any client.'),
('Personal – Aló', 'personal', 20,
'Casual, 2 to 4 sentences, first person.
1. The pain: missed calls, and Spanish-speaking patients who hang up when no one answers in Spanish.
2. Aló: a bilingual receptionist that never misses a call.
3. Offer a quick demo.
4. End with a light question.'),
('Personal – KeepMedCover', 'personal', 30,
'Casual, 2 to 4 sentences, first person.
1. The pain: Medicaid patients losing coverage under the new work requirements.
2. KeepMedCover (keepmedcover.com): a bilingual WhatsApp/text tool that helps patients keep their coverage.
3. Offer a quick demo.
4. End with a light question.')
ON CONFLICT (name) DO NOTHING;

-- --------------------------------------------------------------------------
-- 2. New contact fields
-- --------------------------------------------------------------------------

ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS side TEXT,
    ADD COLUMN IF NOT EXISTS list TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT,
    ADD COLUMN IF NOT EXISTS org_type TEXT,
    ADD COLUMN IF NOT EXISTS location TEXT;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_side_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_side_check
    CHECK (side IS NULL OR side IN ('nymbl', 'personal'));

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_priority_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_priority_check
    CHECK (priority IS NULL OR priority IN ('A', 'B', 'C'));

-- Renaming a list in Settings carries its contacts along; deleting a list keeps them
ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_list_fkey;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_list_fkey
    FOREIGN KEY (list) REFERENCES public.crm_lists (name) ON UPDATE CASCADE ON DELETE SET NULL;

-- Everyone already in the CRM came from Nymbl work (events, VytalMed, Grader)
UPDATE public.contacts SET side = 'nymbl' WHERE side IS NULL AND source IS DISTINCT FROM 'Newsletter';

CREATE INDEX IF NOT EXISTS contacts_outreach_idx ON public.contacts (list, status, priority);
CREATE INDEX IF NOT EXISTS contacts_linkedin_idx ON public.contacts (lower(linkedin_url));

-- --------------------------------------------------------------------------
-- 3. New first stage: "To contact"
-- --------------------------------------------------------------------------

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_status_check;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_status_check CHECK (status IN (
    'To contact', 'Reached out', 'Replied', 'Graded', 'Call booked', 'Demo built',
    'Demo reviewed', 'Handed to Nymbl', 'Nurture', 'Not a Fit'
));

COMMIT;

-- Check
-- SELECT name, side FROM public.crm_lists ORDER BY sort;
-- SELECT side, count(*) FROM public.contacts GROUP BY side;
