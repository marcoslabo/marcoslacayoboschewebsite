// ==========================================================================
// POST /api/subscribe
// Body: { email, first_name?, role?, source?, course?, utm_source?, utm_campaign?, website? }
//   website — honeypot; real people never fill it
//   course  — 'first-agent' also enrolls them in the 5-day email course
//
// Adds the person to the Watch the Work newsletter (beehiiv) and to the CRM
// (stage Nurture, source Newsletter). Every email form on the site posts here.
//
// GET runs the daily cron (course emails, then the beehiiv sync), or
// ?course_unsub=<id> stops someone's course emails.
// ==========================================================================

import { subscribe, ROLES } from '../lib/beehiiv.js';
import { ensureNewsletterContact } from '../lib/crm.js';
import { beehiivSync } from '../lib/beehiiv-sync.js';
import { COURSE, enrollInCourse, courseDrip, courseUnsubscribe } from '../lib/course.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    if (req.method === 'GET') {
        if (req.query?.course_unsub) return courseUnsubscribe(req, res);
        // Daily cron (Vercel Cron, CRON_SECRET-protected): course emails, then beehiiv → CRM
        const secret = process.env.CRON_SECRET;
        if (secret && req.headers.authorization === `Bearer ${secret}`) {
            try {
                console.log('course drip done:', JSON.stringify(await courseDrip()));
            } catch (e) {
                console.error('course drip failed:', e.message);
            }
        }
        return beehiivSync(req, res);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { email, first_name, role, source, course, utm_source, utm_campaign, website } = req.body || {};
    const inCourse = course === COURSE;

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
        // The course still works without the newsletter
        if (!inCourse) return res.status(e.status || 500).json({ error: e.message || 'Subscribe failed' });
        console.warn('Newsletter subscribe (non-fatal for the course):', e.message);
    }

    let courseResult = null;
    if (inCourse) {
        try {
            courseResult = await enrollInCourse({ email: cleanEmail, firstName: cleanName || undefined });
        } catch (e) {
            console.error('Course enroll failed:', e.message);
            return res.status(500).json({ error: "We couldn't start the course. Please try again in a minute." });
        }
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

    return res.status(200).json({ ok: true, course: courseResult });
}
