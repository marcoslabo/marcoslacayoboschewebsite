// ==========================================================================
// Daily beehiiv → CRM sync. Runs as GET /api/subscribe (Vercel Cron, see
// vercel.json); it lives there because the Hobby plan allows 12 functions.
//
// Keeps the CRM in step with the newsletter:
//   1. Any beehiiv subscriber missing from the CRM becomes a Nurture contact
//      (covers sign-ups that didn't come through the website: beehiiv's own
//      page, LinkedIn Newsletter link, recommendations, imports).
//   2. Anyone who has clicked a link in an issue is flagged high-intent.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set.
// ==========================================================================

import { listSubscriptions } from './beehiiv.js';
import { ensureNewsletterContact, markEngaged } from './crm.js';

export async function beehiivSync(req, res) {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const summary = { seen: 0, created: 0, engaged: 0, errors: 0 };

    try {
        for await (const sub of listSubscriptions()) {
            summary.seen += 1;
            try {
                const fields = Object.fromEntries((sub.custom_fields || []).map(f => [f.name, f.value]));
                const { created } = await ensureNewsletterContact({
                    email: sub.email,
                    firstName: fields['First Name'],
                    lastName: fields['Last Name'],
                    role: fields['Role'],
                    source: sub.utm_source ? `beehiiv:${sub.utm_source}` : 'beehiiv'
                });
                if (created) summary.created += 1;

                const clicks = sub.stats?.total_unique_clicked ?? sub.stats?.total_clicked ?? 0;
                if (clicks > 0 && await markEngaged(sub.email, `📬 Clicked a newsletter link (${clicks}x)`)) {
                    summary.engaged += 1;
                }
            } catch (e) {
                summary.errors += 1;
                console.warn('beehiiv-sync row failed:', sub.email, e.message);
            }
        }
    } catch (e) {
        console.error('beehiiv-sync failed:', e.message);
        return res.status(e.status || 500).json({ error: e.message, ...summary });
    }

    console.log('beehiiv-sync done:', JSON.stringify(summary));
    return res.status(200).json({ ok: true, ...summary });
}
