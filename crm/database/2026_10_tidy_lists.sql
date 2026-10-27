-- ==========================================================================
-- Tidy lists: Personal gets everyone receptionist / Medicaid; Nymbl becomes
-- three lists. Safe to run again. The table at the end shows the result.
--
--   Recepcionista / receptionist / Aló → Personal – Aló
--   Medicaid / KeepMedCover            → Personal – KeepMedCover
--   Any HIMSS campaign                 → Nymbl – HIMSS 2026
--   Met in Person                      → Nymbl – Met in Person
--   Every other Nymbl contact          → Nymbl – VytalMed
-- ==========================================================================

BEGIN;

-- The lists we keep (each Nymbl list uses the VytalMed message template)
INSERT INTO public.crm_lists (name, side, sort, template) VALUES
    ('Personal – Aló', 'personal', 20, ''),
    ('Personal – KeepMedCover', 'personal', 30, ''),
    ('Nymbl – VytalMed', 'nymbl', 10, ''),
    ('Nymbl – HIMSS 2026', 'nymbl', 11, ''),
    ('Nymbl – Met in Person', 'nymbl', 12, '')
ON CONFLICT (name) DO NOTHING;

UPDATE public.crm_lists SET template = coalesce(
    (SELECT template FROM public.crm_lists
     WHERE lower(name) = lower('Nymbl – VytalMed') AND template <> '' LIMIT 1),
'Casual, 2 to 4 sentences, first person, like a note from one operator to another.
1. Their likely workflow headache, in plain words, based on their title, organization and notes.
2. One line of proof: we built AI for a large radiology group: 3M+ reads a year, projected $3.5M a year in software savings.
3. The offer: "Want me to build you a free working demo of that? No access to your systems needed."
4. End with a light question.
Never name any client.')
WHERE side = 'nymbl' AND template = '';

-- Personal templates, if they're empty
UPDATE public.crm_lists SET template = 'Casual, 2 to 4 sentences, first person.
1. The pain: missed calls, and Spanish-speaking patients who hang up when no one answers in Spanish.
2. Aló: a bilingual receptionist that never misses a call.
3. Offer a quick demo.
4. End with a light question.'
WHERE name = 'Personal – Aló' AND template = '';

UPDATE public.crm_lists SET template = 'Casual, 2 to 4 sentences, first person.
1. The pain: Medicaid patients losing coverage under the new work requirements.
2. KeepMedCover (keepmedcover.com): a bilingual WhatsApp/text tool that helps patients keep their coverage.
3. Offer a quick demo.
4. End with a light question.'
WHERE name = 'Personal – KeepMedCover' AND template = '';

-- Personal projects (by campaign, whatever list they were on)
UPDATE public.contacts SET list = 'Personal – Aló'
WHERE event_tag IS NOT NULL
  AND lower(event_tag) ~ '(recep|receptionist|al[oó]\M|front ?desk|missed ?call)'
  AND list IS DISTINCT FROM 'Personal – Aló';

UPDATE public.contacts SET list = 'Personal – KeepMedCover'
WHERE event_tag IS NOT NULL
  AND lower(event_tag) ~ '(medicaid|keep ?med|coverage)'
  AND list IS DISTINCT FROM 'Personal – KeepMedCover';

-- Nymbl: three lists
UPDATE public.contacts SET list = 'Nymbl – HIMSS 2026'
WHERE side = 'nymbl' AND event_tag ILIKE '%himss%'
  AND list IS DISTINCT FROM 'Nymbl – HIMSS 2026';

UPDATE public.contacts SET list = 'Nymbl – Met in Person'
WHERE side = 'nymbl' AND lower(trim(event_tag)) = 'met in person'
  AND list IS DISTINCT FROM 'Nymbl – Met in Person';

UPDATE public.contacts SET list = 'Nymbl – VytalMed'
WHERE side = 'nymbl'
  AND (list IS NULL OR list NOT IN ('Nymbl – HIMSS 2026', 'Nymbl – Met in Person', 'Nymbl – VytalMed'));

-- Remove Nymbl lists nobody is on anymore
DELETE FROM public.crm_lists l
WHERE l.side = 'nymbl'
  AND l.name NOT IN ('Nymbl – VytalMed', 'Nymbl – HIMSS 2026', 'Nymbl – Met in Person')
  AND NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.list = l.name);

COMMIT;

SELECT side, list, count(*) AS people
FROM public.contacts
GROUP BY 1, 2
ORDER BY 1, 3 DESC;
