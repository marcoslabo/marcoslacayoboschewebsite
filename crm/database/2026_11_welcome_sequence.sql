-- ==========================================================================
-- Welcome sequence: 10 emails for everyone who joins (lib/welcome.js).
-- One row per email address. The website (service key) writes it;
-- CRM users can read it. Safe to run again.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.welcome_sequence (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL UNIQUE,
    first_name    text,
    source        text,          -- which form: homepage, 5-days, diagnose, skool...
    utm_source    text,          -- which channel: instagram, linkedin, skool...
    started_at    timestamptz NOT NULL DEFAULT now(),
    last_sent     int NOT NULL DEFAULT 0,
    last_sent_at  timestamptz,
    unsubscribed  boolean NOT NULL DEFAULT false,
    created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.welcome_sequence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM users only" ON public.welcome_sequence;
CREATE POLICY "CRM users only" ON public.welcome_sequence
    FOR SELECT TO authenticated USING (public.is_crm_user());

-- Where are sign-ups coming from?
-- SELECT coalesce(utm_source, source) AS channel, count(*) FROM public.welcome_sequence GROUP BY 1 ORDER BY 2 DESC;

-- Check: should return 0 rows and no error
SELECT * FROM public.welcome_sequence LIMIT 5;
