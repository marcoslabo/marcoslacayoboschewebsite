// ==========================================================================
// POST /api/subscribe
// Body: { email, first_name?, role?, source?, course?, utm_source?, utm_campaign?, website? }
//   website — honeypot; real people never fill it
//   course  — 'first-agent' also enrolls them in the 5-day email course
//
// Adds the person to the email list (Brevo, lib/brevo-contacts.js), the 10-email
// welcome sequence (lib/welcome.js) and the CRM (stage Nurture, source
// Newsletter). Every email form on the site posts here, and so can Zapier
// (e.g. new Skool members: {email, first_name, source:'skool', utm_source:'skool'}).
//
// POST {action:'course-plan', ...} emails a 5-day course student their Day 5
// plan and saves them as a lead (lib/course.js → sendCoursePlan).
//
// GET runs the daily cron (course + welcome emails, then the old beehiiv → CRM sync),
// or ?course_unsub=<id> / ?welcome_unsub=<id> stops those emails.
// ==========================================================================

import { ROLES } from '../lib/beehiiv.js';
import { addSignupContact } from '../lib/brevo-contacts.js';
import { ensureNewsletterContact } from '../lib/crm.js';
import { beehiivSync } from '../lib/beehiiv-sync.js';
import { COURSE, enrollInCourse, courseDrip, courseUnsubscribe, sendCoursePlan } from '../lib/course.js';
import { enrollInWelcome, welcomeDrip, welcomeUnsubscribe } from '../lib/welcome.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
    if (req.method === 'GET') {
        if (req.query?.course_unsub) return courseUnsubscribe(req, res);
        if (req.query?.welcome_unsub) return welcomeUnsubscribe(req, res);
        // Daily cron (Vercel Cron, CRON_SECRET-protected): course emails, then beehiiv → CRM
        const secret = process.env.CRON_SECRET;
        if (secret && req.headers.authorization === `Bearer ${secret}`) {
            try {
                console.log('course drip done:', JSON.stringify(await courseDrip()));
            } catch (e) {
                console.error('course drip failed:', e.message);
            }
            try {
                console.log('welcome drip done:', JSON.stringify(await welcomeDrip()));
            } catch (e) {
                console.error('welcome drip failed:', e.message);
            }
        }
        return beehiivSync(req, res);
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    if (req.body?.action === 'course-plan') return coursePlan(req, res);

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
        await addSignupContact({
            email: cleanEmail,
            firstName: cleanName || undefined,
            source: cleanSource,
            utmSource: clip(utm_source)
        });
    } catch (e) {
        // The course still works without the newsletter
        if (!inCourse) {
            console.error('Sign-up failed:', e.message);
            return res.status(502).json({ error: "We couldn't sign you up right now. Please try again in a minute." });
        }
        console.warn('Email list (non-fatal for the course):', e.message);
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

    // 10-email welcome sequence, for every door (course students start after the course)
    try {
        await enrollInWelcome({
            email: cleanEmail,
            firstName: cleanName || undefined,
            source: cleanSource,
            utmSource: clip(utm_source),
            inCourse
        });
    } catch (e) {
        console.warn('Welcome sequence (non-fatal):', e.message);
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

async function coursePlan(req, res) {
    const { email, first_name, role, path, problem, follow_up, doc, website } = req.body || {};
    if (website) return res.status(200).json({ ok: true });

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Please enter a valid email' });
    const cleanName = typeof first_name === 'string' ? first_name.trim().slice(0, 60) : '';
    if (!cleanName) return res.status(400).json({ error: 'Please add your first name' });
    const cleanProblem = typeof problem === 'string' ? problem.trim().slice(0, 140) : '';
    const cleanDoc = typeof doc === 'string' ? doc.trim().slice(0, 8000) : '';
    if (!cleanProblem || !cleanDoc) return res.status(400).json({ error: 'Your plan is missing. Open this page from Day 5 of the workbench.' });

    try {
        const r = await sendCoursePlan({
            email: cleanEmail,
            firstName: cleanName,
            role: ROLES.includes(role) ? role : undefined,
            path: path === 'founder' ? 'founder' : 'org',
            problem: cleanProblem,
            followUp: follow_up === true,
            doc: cleanDoc
        });
        return res.status(200).json({ ok: true, emailSent: r.emailSent });
    } catch (e) {
        console.error('Course plan email failed:', e.message);
        return res.status(502).json({ error: "We couldn't send your plan. Please try again in a minute." });
    }
}
