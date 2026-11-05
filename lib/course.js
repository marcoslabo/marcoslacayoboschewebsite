// ==========================================================================
// "Build your first AI agent in 5 days" email course.
//
//   enrollInCourse()  — called by POST /api/subscribe; sends Day 1 right away
//   courseDrip()      — called by the daily cron (GET /api/subscribe); sends
//                       the next day to anyone who is due, one email per run
//   courseUnsubscribe — GET /api/subscribe?course_unsub=<enrollment id>
//
// Enrollments live in public.course_enrollments
// (crm/database/2026_11_course_enrollments.sql). Emails go out through Brevo.
// ==========================================================================

import { rest } from './supabase-server.js';

export const COURSE = 'first-agent';
const SITE = 'https://www.marcoslacayobosche.com';
const DAY_MS = 24 * 60 * 60 * 1000;

const workbench = day => `${process.env.COURSE_WORKBENCH_URL || 'https://claude.ai/artifact/SZQpQsPiN9HEyzPVZaQwS9'}#day-${day}`;
const calendly = () => process.env.GRADER_CALENDLY_URL || 'https://calendly.com/marcos-bosche-nymbl/30min';

// One move a day. Each paragraph is plain text; the button opens that day of the workbench.
export const EMAILS = [
    {
        subject: 'Day 1: the boring workflow wins',
        preview: 'Pick the one workflow your team hates the most.',
        body: [
            'Welcome. For the next five days you get one short email and one move. By day 5 you will have a plan for your first AI agent, instructions to test it in Claude, and a one-page spec.',
            "Today's move: pick the workflow. 10 minutes.",
            "The best first agent is boring. It happens every day, follows the same steps, needs no clinical judgment, and your team can't stand it. Referral faxes. Eligibility checks. Prior auth status calls.",
            'When I worked as a paramedic we treated what kills first. In a practice, what kills first is the work that eats hours every single day.',
            'Open Day 1 of the workbench, list three or four tasks and rate them. Go with the one that scores highest.'
        ],
        button: 'Open Day 1',
        next: 'Tomorrow: map it.'
    },
    {
        subject: "Day 2: nobody has written it down",
        preview: "Map the workflow the way it really happens.",
        body: [
            "Most workflows only exist in one person's head. You can't automate that.",
            "Today's move: map it. 15 minutes.",
            'Ask the person who does it every day to tell you how it really goes, workarounds included. "I print it, put it in the blue tray, then check Availity…" Write it down exactly like that. Messy is perfect.',
            'Paste it into Day 2 and Claude turns it into clear steps: who, what, which system, how many minutes. Fix anything that looks off. If you can, watch it happen once and correct the minutes.',
            'The workarounds are where the agent pays for itself.'
        ],
        button: 'Open Day 2',
        next: 'Tomorrow: what it costs you.'
    },
    {
        subject: 'Day 3: what does this workflow cost you?',
        preview: 'The number that gets an AI project approved.',
        body: [
            "Today's move: put a number on it. 10 minutes.",
            'Volume × minutes × hourly cost. In the example practice in the workbench, 60 referral faxes a week at 30 minutes each is 30 hours a week. That is $39,000 a year, almost a full-time person doing nothing but fax intake.',
            'Use real volume from your EMR or fax log if you can. Then copy the one-line summary on Day 3 and send it to whoever signs off on budget.',
            "That number is what gets an AI project approved. Not the technology."
        ],
        button: 'Open Day 3',
        next: "Tomorrow: what the agent should not do."
    },
    {
        subject: 'Day 4: what the agent should NOT do',
        preview: 'AI takes the busywork. Your team stays in charge.',
        body: [
            "Today's move: design the agent. 20 minutes.",
            'Every step gets one of three owners. Agent does it: reading, sorting, checking, filling forms. Agent drafts, a person approves: anything that reaches a patient, a payer or the chart. Person only: clinical decisions and real conversations.',
            'Claude suggests the owners and lists the tools the agent needs, and how each one connects to your EMR, phones and portals. You make the final call.',
            'Then go through the HIPAA checklist. The big one: every vendor that touches patient data signs a BAA, and you test only with made-up examples until then.'
        ],
        button: 'Open Day 4',
        next: 'Tomorrow: build it and try it.'
    },
    {
        subject: 'Day 5: build it (and try it today)',
        preview: 'Your agent instructions and one-page spec are ready.',
        body: [
            "Today's move: build it. 30 minutes.",
            'Day 5 turns everything into agent instructions. Copy them into a new Claude Project, write three made-up examples (make one messy), and watch what the agent does. When it gets something wrong, fix the step and copy the instructions again.',
            'You also get a one-page spec: the case, the steps, the tools, the HIPAA checklist and what success looks like.',
            "The test shows the agent thinks right. Going live means connecting it to your EMR, phones and payers, signing BAAs and putting approvals in place. That's the part I build. If you want it built, bring your spec to a 30-minute call.",
            'And reply to this email to tell me which workflow you picked. I read every reply.'
        ],
        button: 'Open Day 5',
        next: null,
        cta: true
    }
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailHtml(day, firstName, enrollmentId) {
    const e = EMAILS[day - 1];
    const unsub = `${SITE}/api/subscribe?course_unsub=${encodeURIComponent(enrollmentId)}`;
    const p = text => `<p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1e293b;">${esc(text)}</p>`;
    return `<!DOCTYPE html>
<html><body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<span style="display:none; max-height:0; overflow:hidden;">${esc(e.preview)}</span>
<div style="max-width:560px; margin:0 auto; background:#ffffff; padding:32px 28px;">
    <div style="font-size:12px; font-weight:700; color:#4334dc; text-transform:uppercase; letter-spacing:1.2px; margin-bottom:18px;">Build your first AI agent · Day ${day} of 5</div>
    ${p(`Hi ${firstName || 'there'},`)}
    ${e.body.map(p).join('\n    ')}
    <div style="margin:26px 0;">
        <a href="${esc(workbench(day))}" style="display:inline-block; padding:13px 22px; background:#4334dc; color:#ffffff; border-radius:10px; text-decoration:none; font-weight:700; font-size:15px;">${esc(e.button)} →</a>
    </div>
    ${e.cta ? `<div style="background:#0f172a; padding:22px; border-radius:12px; margin:0 0 22px;">
        <div style="color:#ffffff; font-size:16px; font-weight:700; margin-bottom:6px;">Want it connected to your systems?</div>
        <div style="color:#94a3b8; font-size:14px; line-height:1.5; margin-bottom:14px;">30 minutes, your spec, and a plan to take it live under a BAA.</div>
        <a href="${esc(calendly())}" style="display:inline-block; padding:11px 18px; background:#ffffff; color:#0f172a; border-radius:9px; text-decoration:none; font-weight:700; font-size:14px;">Book a 30-min call</a>
    </div>` : ''}
    ${e.next ? p(e.next) : ''}
    ${p('Marcos')}
    <p style="margin:24px 0 0; font-size:13px; line-height:1.5; color:#64748b;">P.S. No patient information anywhere in the workbench. Describe the work, never the patient.</p>
    <p style="margin:28px 0 0; font-size:12px; color:#94a3b8; text-align:center;">You signed up for the 5-day course at marcoslacayobosche.com.<br><a href="${esc(unsub)}" style="color:#94a3b8;">Stop the course emails</a></p>
</div></body></html>`;
}

async function sendDay(day, { id, email, first_name }) {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) throw new Error('BREVO_API_KEY not configured');
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevoKey, accept: 'application/json' },
        body: JSON.stringify({
            sender: {
                name: process.env.GRADER_SENDER_NAME || 'Marcos Lacayo Bosche',
                email: process.env.GRADER_SENDER_EMAIL || 'marcos@marcoslacayobosche.com'
            },
            replyTo: { email: process.env.COURSE_REPLY_TO || 'marcoslacayobosche@gmail.com', name: 'Marcos Lacayo Bosche' },
            to: [{ email, name: first_name || undefined }],
            subject: EMAILS[day - 1].subject,
            htmlContent: emailHtml(day, first_name, id),
            tags: ['course-first-agent', `course-day-${day}`]
        })
    });
    if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
}

/**
 * Enroll and send Day 1 now. Someone already enrolled isn't restarted.
 * @returns {Promise<{enrolled: boolean, day1Sent: boolean}>}
 */
export async function enrollInCourse({ email, firstName }) {
    const rows = await rest(`course_enrollments?on_conflict=email,course`, {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: { email, first_name: firstName || null, course: COURSE }
    });
    const row = rows?.[0];
    if (!row) return { enrolled: false, day1Sent: false };   // already enrolled

    await sendDay(1, row);
    await rest(`course_enrollments?id=eq.${row.id}`, { method: 'PATCH', body: { last_day_sent: 1, last_sent_at: new Date().toISOString() } });
    return { enrolled: true, day1Sent: true };
}

/**
 * Daily: send each active student the next day they're due, never more than one per run.
 */
export async function courseDrip() {
    const summary = { due: 0, sent: 0, errors: 0 };
    const active = await rest(`course_enrollments?course=eq.${COURSE}&unsubscribed=eq.false&last_day_sent=lt.${EMAILS.length}&select=id,email,first_name,started_at,last_day_sent&limit=1000`);

    for (const row of active || []) {
        const daysIn = Math.floor((Date.now() - new Date(row.started_at).getTime() + 2 * 60 * 60 * 1000) / DAY_MS);
        const next = row.last_day_sent + 1;
        if (next > daysIn + 1) continue;   // not due yet
        summary.due += 1;
        try {
            await sendDay(next, row);
            await rest(`course_enrollments?id=eq.${row.id}`, { method: 'PATCH', body: { last_day_sent: next, last_sent_at: new Date().toISOString() } });
            summary.sent += 1;
        } catch (e) {
            summary.errors += 1;
            console.warn('course drip failed:', row.email, e.message);
        }
    }
    return summary;
}

export async function courseUnsubscribe(req, res) {
    const id = String(req.query.course_unsub || '');
    if (/^[0-9a-f-]{36}$/i.test(id)) {
        await rest(`course_enrollments?id=eq.${id}`, { method: 'PATCH', body: { unsubscribed: true } }).catch(e => console.warn('course unsubscribe failed:', e.message));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:480px; margin:80px auto; padding:0 20px; color:#0f172a;">
<h1 style="font-size:24px;">You won't get any more course emails.</h1>
<p style="color:#475569; line-height:1.6;">The workbench is still yours: <a href="${esc(workbench(1))}">open it here</a>. To stop the newsletter too, use the link at the bottom of any newsletter issue.</p>
<p><a href="${SITE}">marcoslacayobosche.com</a></p></body></html>`);
}
