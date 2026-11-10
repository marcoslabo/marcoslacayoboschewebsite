// ==========================================================================
// "Build your health idea with AI in 5 days" email course.
//
//   enrollInCourse()  — called by POST /api/subscribe; sends Day 1 right away
//   courseDrip()      — called by the daily cron (GET /api/subscribe); sends
//                       the next day to anyone who is due, one email per run
//   courseUnsubscribe — GET /api/subscribe?course_unsub=<enrollment id>
//   sendCoursePlan()  — POST /api/subscribe {action:'course-plan'}: emails the
//                       student their Day 5 plan and saves the lead (see below)
//
// Enrollments live in public.course_enrollments
// (crm/database/2026_11_course_enrollments.sql). Emails go out through Brevo.
// ==========================================================================

import { rest } from './supabase-server.js';
import { upsertLead } from './crm.js';

export const COURSE = 'first-agent';
const SITE = 'https://www.marcoslacayobosche.com';
const DAY_MS = 24 * 60 * 60 * 1000;

const workbench = day => `${process.env.COURSE_WORKBENCH_URL || 'https://claude.ai/artifact/SZQpQsPiN9HEyzPVZaQwS9'}#day-${day}`;
const calendly = () => process.env.GRADER_CALENDLY_URL || 'https://calendly.com/marcos-bosche-nymbl/30min';

// One move a day. Each paragraph is plain text; the button opens that day of the workbench.
export const EMAILS = [
    {
        subject: 'Day 1: find the problem worth solving',
        preview: 'Your idea starts with a problem people hate.',
        body: [
            "Welcome. For the next five days you get one short email and one move. By Day 5 you'll have a prototype tested in Claude and a one-page plan. You can build this.",
            'First, pick your path at the top of the workbench: inside your organization, or on your own as a founder.',
            "Today's move: find the problem worth solving. 15 minutes.",
            "List three or four problems people in healthcare can't stand, and rate each one: how often it happens, if it's the same steps every time, how much people hate it, and if others have it too. Referral faxes. Eligibility checks. Prior auth calls.",
            'When I worked as a paramedic we treated what kills first. In a practice, what kills first is the work that eats hours every single day.',
            "Then write down how the top one really happens, in the staff's own words. Claude turns it into steps."
        ],
        button: 'Open Day 1',
        next: 'Tomorrow: check that people want it.'
    },
    {
        subject: 'Day 2: will anyone pay for this?',
        preview: 'Put a number on it, then talk to 3 people.',
        body: [
            "Today's move: check that people want it. 20 minutes, plus three short conversations.",
            'First the money. Times a week × minutes × cost per hour. In the example practice, 60 referral faxes a week at 30 minutes each is 1,560 hours a year. About $40,000. Three quarters of a full-time person, just on faxes.',
            'Then talk to 3 people who live with the problem. Ask about the past, not about your idea: "When did this last happen to you?" The workbench has all five questions.',
            'Write down what they say, word for word. One real quote beats a hundred guesses.'
        ],
        button: 'Open Day 2',
        next: 'Tomorrow: build it in Claude.'
    },
    {
        subject: 'Day 3: build your prototype today',
        preview: 'Your agent, working in Claude, tested on 3 made-up cases.',
        body: [
            "Today's move: build a prototype in Claude. 30 minutes.",
            'Every step gets one of three owners. Agent does it: reading, sorting, checking, filling forms. Agent drafts, a person approves: anything that reaches a patient, a payer or the chart. Person only: clinical decisions and real conversations.',
            "The workbench writes your agent's instructions from that. Paste them into a new Claude Project, run the three made-up test cases, and see what it gets wrong.",
            "Wrong is good. Every fix makes it better. That's how real products get built."
        ],
        button: 'Open Day 3',
        next: 'Tomorrow: make it safe.'
    },
    {
        subject: "Day 4: make it safe (before it's real)",
        preview: 'BAAs, made-up data and an off switch.',
        body: [
            "Today's move: make it safe. 15 minutes.",
            'List every tool your agent touches: EMR, phones, fax, portals. For each one, write how it connects and whether the vendor signs a BAA. A BAA is the contract that makes a vendor responsible for protecting patient data. No BAA, no real patient data.',
            "Then go through the six-item HIPAA checklist. Until all six are checked, your prototype stays a demo with made-up data. That's fine. That's how it should be.",
            'Safety is what lets IT and compliance say yes.'
        ],
        button: 'Open Day 4',
        next: 'Tomorrow: launch it.'
    },
    {
        subject: 'Day 5: launch it, or make it a business',
        preview: 'Your one-page plan is ready.',
        body: [
            "Today's move: launch it. 20 minutes.",
            'Inside an organization? You get a one-page spec and five lines for your boss: the problem, the cost, the fix, the safety plan and the ask.',
            "On your own? You get a one-page business plan: who it's for, the problem in their words, the price, your first five customers, the biggest risk and next week's one step.",
            "You built this. Now keep building it yourself, or let's build it together. Going live means connecting it to real systems, signing BAAs and putting approvals in place. That's the part I build.",
            'And reply to this email to tell me what you built. I read every reply.'
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
    <div style="font-size:12px; font-weight:700; color:#4334dc; text-transform:uppercase; letter-spacing:1.2px; margin-bottom:18px;">Build your health idea with AI · Day ${day} of 5</div>
    ${p(`Hi ${firstName || 'there'},`)}
    ${e.body.map(p).join('\n    ')}
    <div style="margin:26px 0;">
        <a href="${esc(workbench(day))}" style="display:inline-block; padding:13px 22px; background:#4334dc; color:#ffffff; border-radius:10px; text-decoration:none; font-weight:700; font-size:15px;">${esc(e.button)} →</a>
    </div>
    ${e.cta ? `<div style="background:#0f172a; padding:22px; border-radius:12px; margin:0 0 22px;">
        <div style="color:#ffffff; font-size:16px; font-weight:700; margin-bottom:6px;">Want to build it together?</div>
        <div style="color:#94a3b8; font-size:14px; line-height:1.5; margin-bottom:14px;">30 minutes, your one-page plan, and a path to take it live under a BAA.</div>
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

// ==========================================================================
// "Email me my plan" (Day 5 of the workbench → /5-days/plan → here).
// Emails the student their plan and saves ONLY name, email, role, path, the
// one-line problem, follow-up yes/no and the date to the CRM. The plan itself
// is emailed, never stored.
// ==========================================================================

const PATH_LABEL = { org: 'Inside my organization', founder: 'On my own (founder)' };
const ROLE_LABEL = { physician: 'Physician', 'operations-leader': 'Operations leader', 'practice-owner': 'Practice owner', builder: 'Builder / founder', other: 'Other' };

async function brevo(payload) {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) throw new Error('BREVO_API_KEY not configured');
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': brevoKey, accept: 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
}

const sender = () => ({
    name: process.env.GRADER_SENDER_NAME || 'Marcos Lacayo Bosche',
    email: process.env.GRADER_SENDER_EMAIL || 'marcos@marcoslacayobosche.com'
});

/**
 * @param {{email:string, firstName:string, role?:string, path:string, problem:string, followUp:boolean, doc:string}} lead
 * @returns {Promise<{emailSent:boolean, contactId:string|null}>}
 */
export async function sendCoursePlan({ email, firstName, role, path, problem, followUp, doc }) {
    const pathLabel = PATH_LABEL[path] || PATH_LABEL.org;
    const roleLabel = ROLE_LABEL[role] || '';

    // 1. Their plan, by email (not stored anywhere)
    await brevo({
        sender: sender(),
        replyTo: { email: process.env.COURSE_REPLY_TO || 'marcoslacayobosche@gmail.com', name: 'Marcos Lacayo Bosche' },
        to: [{ email, name: firstName || undefined }],
        subject: `Your plan: ${problem}`,
        tags: ['course-first-agent', 'course-plan'],
        htmlContent: `<!DOCTYPE html>
<html><body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:620px; margin:0 auto; background:#ffffff; padding:32px 28px;">
    <div style="font-size:12px; font-weight:700; color:#4334dc; text-transform:uppercase; letter-spacing:1.2px; margin-bottom:18px;">Build your health idea with AI · Your plan</div>
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1e293b;">Hi ${esc(firstName || 'there')},</p>
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1e293b;">You built this. Here's your plan for <strong>${esc(problem)}</strong>, ready to copy and send.</p>
    <pre style="white-space:pre-wrap; word-break:break-word; font-family:ui-monospace,Menlo,Consolas,monospace; font-size:13px; line-height:1.6; background:#f1f5f9; border-radius:10px; padding:16px; color:#0f172a; margin:0 0 22px;">${esc(doc)}</pre>
    <div style="background:#0f172a; padding:22px; border-radius:12px; margin:0 0 22px;">
        <div style="color:#ffffff; font-size:16px; font-weight:700; margin-bottom:6px;">Keep building it yourself, or let's build it together.</div>
        <div style="color:#94a3b8; font-size:14px; line-height:1.5; margin-bottom:14px;">30 minutes, this plan, and a path to take it live under a BAA.</div>
        <a href="${esc(calendly())}" style="display:inline-block; padding:11px 18px; background:#ffffff; color:#0f172a; border-radius:9px; text-decoration:none; font-weight:700; font-size:14px;">Book a 30-min call</a>
    </div>
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1e293b;">Reply and tell me what you built. I read every reply.</p>
    <p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1e293b;">Marcos</p>
    <p style="margin:28px 0 0; font-size:12px; color:#94a3b8; text-align:center;">You asked for this from the 5-day workbench at marcoslacayobosche.com.</p>
</div></body></html>`
    });

    // 2. The lead: listed fields only
    let contactId = null;
    try {
        const r = await upsertLead({
            email,
            firstName,
            stage: followUp ? 'To contact' : 'Nurture',
            source: 'Other',
            problem: `🎓 5-day course plan · ${pathLabel}: ${problem}`,
            note: `Emailed their Day 5 plan from the 5-day course. Path: ${pathLabel}.${roleLabel ? ` Role: ${roleLabel}.` : ''} Problem: ${problem}. Follow-up: ${followUp ? 'yes' : 'no'}.`,
            extra: { next_action: followUp ? 'Email' : 'None' }
        });
        contactId = r.id;
    } catch (e) {
        console.warn('Course plan CRM (non-fatal):', e.message);
    }

    // 3. Tell Marcos when they want a follow-up
    if (followUp) {
        const crmUrl = `https://www.marcoslacayobosche.com/crm${contactId ? `#/contact/${contactId}` : ''}`;
        await brevo({
            sender: { name: '5-day course', email: sender().email },
            to: [{ email: process.env.LEAD_ALERT_EMAIL || 'marcoslacayobosche@gmail.com' }],
            replyTo: { email, name: firstName || undefined },
            subject: `🎓 ${firstName || email} finished the 5-day course and wants to talk: ${problem}`,
            htmlContent: `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:560px;">
    <h2 style="font-size:18px; color:#0f172a; margin:0 0 12px;">${esc(firstName || email)} finished the course and said you can follow up</h2>
    <p style="font-size:14px; color:#0f172a; margin:0 0 6px;"><strong>Email:</strong> ${esc(email)}</p>
    ${roleLabel ? `<p style="font-size:14px; color:#0f172a; margin:0 0 6px;"><strong>Role:</strong> ${esc(roleLabel)}</p>` : ''}
    <p style="font-size:14px; color:#0f172a; margin:0 0 6px;"><strong>Path:</strong> ${esc(pathLabel)}</p>
    <p style="font-size:14px; color:#0f172a; margin:0 0 16px;"><strong>Problem:</strong> ${esc(problem)}</p>
    <a href="${esc(crmUrl)}" style="display:inline-block; padding:10px 18px; background:#0f172a; color:white; border-radius:8px; text-decoration:none; font-weight:700; font-size:14px;">Open in CRM</a>
    <p style="font-size:13px; color:#64748b; margin-top:16px;">Hit Reply to write to them directly. Their plan went to their inbox; it isn't stored.</p>
</div>`
        }).catch(e => console.warn('Course plan alert (non-fatal):', e.message));
    }
    return { emailSent: true, contactId };
}
