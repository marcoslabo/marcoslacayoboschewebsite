-- ==========================================================================
-- Fresh start: the CRM matches reality (nobody has been contacted yet).
--
--   Everyone you haven't really worked with → To contact (one clean queue)
--   Grader leads → To contact, priority A, keep the 🩺 badge (top of the queue)
--   Call booked, Demo, Won, Not a Fit → unchanged
--
-- A backup of every contact's stage is saved first (crm_backup_2026_10_27),
-- so this can be undone. The table at the end shows before → after.
-- ==========================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.crm_backup_2026_10_27 AS
SELECT id, status, cadence_step, next_action, next_action_date, priority, now() AS saved_at
FROM public.contacts;
ALTER TABLE public.crm_backup_2026_10_27 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_backup_2026_10_27 FROM anon, authenticated;

-- Don't log hundreds of "stage changes" for a cleanup
ALTER TABLE public.contacts DISABLE TRIGGER contacts_stage_log;

UPDATE public.contacts SET
    status = 'To contact',
    cadence_step = 0,
    next_action = 'None',
    next_action_date = NULL,
    priority = CASE WHEN graded_at IS NOT NULL THEN 'A' ELSE priority END
WHERE status IN ('To contact', 'Messaged', 'Replied', 'Nurture');

ALTER TABLE public.contacts ENABLE TRIGGER contacts_stage_log;

COMMIT;

-- Before → after, per side
SELECT c.side, b.status AS was, c.status AS now, count(*) AS people,
       count(*) FILTER (WHERE c.graded_at IS NOT NULL) AS from_grader
FROM public.contacts c
JOIN public.crm_backup_2026_10_27 b ON b.id = c.id
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;

-- To undo:
-- UPDATE public.contacts c SET status = b.status, cadence_step = b.cadence_step,
--   next_action = b.next_action, next_action_date = b.next_action_date, priority = b.priority
-- FROM public.crm_backup_2026_10_27 b WHERE b.id = c.id;
