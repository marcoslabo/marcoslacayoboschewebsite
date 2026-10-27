-- ==========================================================================
-- CRM security: Supabase Auth only, no anonymous access to CRM data
--
-- Run ONCE in the Supabase SQL editor, BEFORE deploying the matching code.
-- Before running:
--   1. Authentication → Users: make sure the three users below exist (email + password).
--      Other apps share this project's users; only the emails listed here get CRM access.
--   2. Vercel: set SUPABASE_SERVICE_KEY (Project Settings → API → service_role).
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. Who may use the CRM (replaces the hard-coded list in api/crm-auth.js)
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.crm_users (
    email TEXT PRIMARY KEY,
    role  TEXT NOT NULL DEFAULT 'team' CHECK (role IN ('admin', 'team')),
    owner TEXT NOT NULL
);

INSERT INTO public.crm_users (email, role, owner) VALUES
    ('marcoslacayobosche@gmail.com',  'admin', 'marcos'),
    ('joy@nymbl.app',                 'team',  'joy'),
    ('kevin.slayden@nymbl.app',       'team',  'kevin')
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, owner = EXCLUDED.owner;

-- True when the signed-in user is on the list. SECURITY DEFINER so policies
-- can call it without granting everyone read access to crm_users.
CREATE OR REPLACE FUNCTION public.is_crm_user()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.crm_users
        WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

REVOKE ALL ON FUNCTION public.is_crm_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_crm_user() TO authenticated;

ALTER TABLE public.crm_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "CRM users read own row" ON public.crm_users;
CREATE POLICY "CRM users read own row" ON public.crm_users
    FOR SELECT TO authenticated
    USING (email = lower(coalesce(auth.jwt() ->> 'email', '')));
REVOKE ALL ON public.crm_users FROM anon;
GRANT SELECT ON public.crm_users TO authenticated;

-- --------------------------------------------------------------------------
-- 2. Replace every policy on the CRM tables with "CRM users only"
-- --------------------------------------------------------------------------

DO $$
DECLARE
    t TEXT;
    p RECORD;
    crm_tables TEXT[] := ARRAY[
        'contacts', 'activities', 'companies', 'briefs', 'results',
        'activity_log', 'contact_triage', 'grader_submissions'
    ];
BEGIN
    FOREACH t IN ARRAY crm_tables LOOP
        IF to_regclass('public.' || t) IS NULL THEN
            RAISE NOTICE 'Skipping %, table does not exist', t;
            CONTINUE;
        END IF;

        -- Drop "Allow all ..." and any other existing policy on the table
        FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
            EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
        END LOOP;

        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
        EXECUTE format(
            'CREATE POLICY "CRM users only" ON public.%I FOR ALL TO authenticated '
            'USING (public.is_crm_user()) WITH CHECK (public.is_crm_user())', t);
    END LOOP;
END $$;

-- Views run as their owner by default, which would let anon read briefs
-- through briefs_with_roi. Make it respect the caller's policies instead.
DO $$
BEGIN
    IF to_regclass('public.briefs_with_roi') IS NOT NULL THEN
        ALTER VIEW public.briefs_with_roi SET (security_invoker = true);
        REVOKE ALL ON public.briefs_with_roi FROM anon;
    END IF;
END $$;

-- --------------------------------------------------------------------------
-- 3. Check: this should return no rows for the CRM tables
-- --------------------------------------------------------------------------
-- SELECT tablename, policyname, roles, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
--   AND tablename IN ('contacts','activities','companies','briefs','results',
--                     'activity_log','contact_triage','grader_submissions')
--   AND policyname <> 'CRM users only';
