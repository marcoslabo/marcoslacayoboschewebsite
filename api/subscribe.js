// ==========================================================================
// POST /api/subscribe
// Body: { email, first_name?, role?, source?, utm_source?, utm_campaign?, website? }
//   website — honeypot; real people never fill it
//
// Adds the person to the Watch the Work newsletter (beehiiv) and to the CRM
// (stage Nurture, source Newsletter). Every email form on the site posts here.
// ==========================================================================

import { subscribe, ROLES } from '../lib/beehiiv.js';
import { ensureNewsletterContact } from '../lib/crm.js';
import { beehiivSync } from '../lib/beehiiv-sync.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    // GET is the daily beehiiv → CRM sync (Vercel Cron, CRON_SECRET-protected)
    if (req.method === 'GET') return beehiivSync(req, res);
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, first_name, role, source, utm_source, utm_campaign, website } = req.body || {};

    // Bots fill every field; pretend it worked
    if (website) return res.status(200).json({ ok: true });

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(cleanEmail)) {
        return res.status(400).json({ error: 'Please enter a valid email' });
    }

    const cleanRole = ROLES.includes(role) ? role : undefined;
    const cleanName = typeof first_name === 'string' ? first_name.trim().slice(0, 60) : '';
    const cleanSource = typeof source === 'string' ? source.trim().slice(0, 80) : 'website';
    const clip = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : undefined);

    try {
        await subscribe({
            email: cleanEmail,
            firstName: cleanName || undefined,
            role: cleanRole,
            source: cleanSource
        });
    } catch (e) {
        return res.status(e.status || 500).json({ error: e.message || 'Subscribe failed' });
    }

    // The sign-up already succeeded; a CRM hiccup shouldn't fail it
    try {
        await ensureNewsletterContact({
            email: cleanEmail,
            firstName: cleanName || undefined,
            role: cleanRole,
            source: cleanSource,
            utmSource: clip(utm_source),
            utmCampaign: clip(utm_campaign)
        });
    } catch (e) {
        console.warn('CRM contact (non-fatal):', e.message);
    }

    return res.status(200).json({ ok: true });
}
