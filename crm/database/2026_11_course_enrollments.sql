-- ==========================================================================
-- 5-day email course: "Build your first AI agent"
-- One row per person per course. The website (service key) writes it;
-- CRM users can read it. Safe to run again.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS public.course_enrollments (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email         text NOT NULL,
    first_name    text,
    course        text NOT NULL DEFAULT 'first-agent',
    started_at    timestamptz NOT NULL DEFAULT now(),
    last_day_sent int NOT NULL DEFAULT 0,
    last_sent_at  timestamptz,
    unsubscribed  boolean NOT NULL DEFAULT false,
    UNIQUE (email, course)
);

ALTER TABLE public.course_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "CRM users only" ON public.course_enrollments;
CREATE POLICY "CRM users only" ON public.course_enrollments
    FOR SELECT TO authenticated USING (public.is_crm_user());

-- Check: should return 0 rows and no error
SELECT * FROM public.course_enrollments LIMIT 5;
