// ==========================================================================
// Server-side Supabase access
// The CRM tables are closed to the public key, so every server endpoint that
// touches them uses the service role key, and CRM-only endpoints check that
// the caller is a signed-in CRM user.
//
// Env (set in Vercel):
//   SUPABASE_SERVICE_KEY — Supabase → Project Settings → API → service_role
// ==========================================================================

export const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
// Public anon key: only used to ask Supabase Auth who a token belongs to.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

/**
 * Headers for the Supabase REST API with the service role key.
 * Throws when the key isn't configured, so failures are loud instead of silent.
 */
export function serviceHeaders(extra = {}) {
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!key) {
        const err = new Error('SUPABASE_SERVICE_KEY is not configured');
        err.status = 503;
        throw err;
    }
    return {
        'Content-Type': 'application/json',
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: 'return=representation',
        ...extra
    };
}

/** fetch() against /rest/v1 with the service key; throws on non-2xx. */
export async function rest(path, { method = 'GET', body, headers } = {}) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
        method,
        headers: serviceHeaders(headers),
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await resp.text();
    if (!resp.ok) {
        const err = new Error(`Supabase ${method} ${path.split('?')[0]} failed: ${resp.status} ${text.slice(0, 200)}`);
        err.status = resp.status;
        throw err;
    }
    return text ? JSON.parse(text) : null;
}

/**
 * Require a signed-in CRM user (Authorization: Bearer <Supabase access token>).
 * Sends a 401 and returns null when the caller isn't one.
 *
 * @returns {Promise<{email:string, role:string, owner:string}|null>}
 */
export async function requireCrmUser(req, res) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) {
        res.status(401).json({ error: 'Sign in to the CRM first' });
        return null;
    }

    try {
        const userResp = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` }
        });
        if (!userResp.ok) {
            res.status(401).json({ error: 'Session expired. Sign in again.' });
            return null;
        }
        const user = await userResp.json();
        const email = String(user.email || '').toLowerCase();

        const rows = await rest(`crm_users?email=eq.${encodeURIComponent(email)}&select=email,role,owner&limit=1`);
        if (!rows?.length) {
            res.status(403).json({ error: 'Not a CRM user' });
            return null;
        }
        return rows[0];
    } catch (e) {
        res.status(e.status === 503 ? 503 : 500).json({ error: e.message });
        return null;
    }
}
