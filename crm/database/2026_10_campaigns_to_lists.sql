-- ==========================================================================
-- One idea instead of two: campaigns (event_tag) become lists.
--
--   Recepcionista / receptionist / Aló / front desk / missed calls → Personal – Aló
--   Medicaid / KeepMedCover / coverage                               → Personal – KeepMedCover
--   Any other campaign (HIMSS, events…)                              → its own Nymbl list
--
-- The list decides the side (trigger from 2026_10_simple_migration.sql), so
-- the receptionist and Medicaid people move to Personal.
-- Only contacts with no list yet are touched. Safe to run again.
-- ==========================================================================

BEGIN;

-- 0. Make sure the two Personal lists exist (in case one was renamed or deleted)
INSERT INTO public.crm_lists (name, side, sort, template) VALUES
    ('Personal – Aló', 'personal', 20, ''),
    ('Personal – KeepMedCover', 'personal', 30, '')
ON CONFLICT (name) DO NOTHING;

-- 1. Personal projects
UPDATE public.contacts SET list = 'Personal – Aló'
WHERE list IS NULL AND event_tag IS NOT NULL
  AND lower(event_tag) ~ '(recep|receptionist|al[oó]\M|front ?desk|missed ?call)';

UPDATE public.contacts SET list = 'Personal – KeepMedCover'
WHERE list IS NULL AND event_tag IS NOT NULL
  AND lower(event_tag) ~ '(medicaid|keep ?med|coverage)';

-- 2. Every other campaign becomes a Nymbl list with the same name
INSERT INTO public.crm_lists (name, side, sort, template)
SELECT DISTINCT 'Nymbl – ' || trim(event_tag), 'nymbl', 50, ''
FROM public.contacts
WHERE list IS NULL AND event_tag IS NOT NULL AND trim(event_tag) <> ''
ON CONFLICT (name) DO NOTHING;

UPDATE public.contacts SET list = 'Nymbl – ' || trim(event_tag)
WHERE list IS NULL AND event_tag IS NOT NULL AND trim(event_tag) <> '';

COMMIT;

-- 3. What you have now (Supabase shows this table after Run)
SELECT side, coalesce(list, '(no list)') AS list, status, count(*) AS people
FROM public.contacts
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
