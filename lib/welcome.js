// ==========================================================================
// Welcome sequence: 10 emails for everyone who joins, whatever door they
// came through (site forms, the 5-day course, the agent finder opt-in,
// Instagram, Skool, LinkedIn links...).
//
//   enrollInWelcome() — called on every sign-up. Sends email 1 right away,
//                       except for 5-day course students: their sequence
//                       starts the day after the course ends.
//   welcomeDrip()     — daily cron: sends the next email to anyone due,
//                       never more than one per person per run.
//   welcomeUnsubscribe — GET /api/subscribe?welcome_unsub=<id>
//
// One row per email address (public.welcome_sequence,
// crm/database/2026_11_welcome_sequence.sql). Sent through Brevo.
//
// Optional env: SKOOL_URL, INSTAGRAM_URL (emails 9 and 10 fall back to the
// 5-day course when they're not set).
// ==========================================================================

import { rest } from './supabase-server.js';

const SITE = 'https://www.marcoslacayobosche.com';
const DAY_MS = 24 * 60 * 60 * 1000;
const COURSE_LENGTH_DAYS = 5;

const course = () => `${SITE}/5-days?utm_source=welcome-email`;
const calendly = () => process.env.GRADER_CALENDLY_URL || 'https://calendly.com/marcos-bosche-nymbl/30min';
const skool = () => process.env.SKOOL_URL || null;
const instagram = () => process.env.INSTAGRAM_URL || null;

// `day` = days after they joined. The cron runs once a day.
export const WELCOME = [
    {
        day: 0,
        subject: "You're in. Here's what happens next",
        preview: 'One question for you before anything else.',
        body: [
            "Welcome. I'm Marcos. I build AI tools for healthcare, and I show people like you how to build them too.",
            "Here's my belief: the person closest to the problem should build the fix. The nurse, the front desk, the practice manager. You see what's broken every single day. For years you couldn't do anything about it. Now you can.",
            "Over the next few weeks I'll send you a short email every few days. Real stories, one idea you can use, and what I'd do in your shoes. No hype.",
            "Now my question: what's the one task at work you'd fix tomorrow if you could? Hit reply and tell me. I read every reply."
        ],
        button: null
    },
    {
        day: 1,
        subject: 'Treat what kills first',
        preview: 'What 5 years as a paramedic taught me about picking problems.',
        body: [
            'Before I built software I was a firefighter and paramedic in Nicaragua for five years.',
            'The first rule on a call: treat what kills first. Not the loudest thing. Not the most interesting thing. The thing that will hurt the most if you ignore it.',
            'Same at work. In a clinic, what kills first is the task that eats hours every single day. Referral faxes. Eligibility checks. Prior auth calls. Reminder calls.',
            "Here's what I'd do today: write down three tasks you can't stand. For each one ask: how often does it happen, is it the same steps every time, and how much does everyone hate it? The winner is your first build."
        ],
        button: null
    },
    {
        day: 3,
        subject: 'I sold my house and my car',
        preview: "You don't need millions, or permission.",
        body: [
            'In 2012 my first startup failed. A company in San Francisco tracking hospital equipment. The money ran out and I had to shut it down.',
            'But while I was in California I kept seeing blood pressure kiosks in stores. And I thought: Nicaragua has nothing like this.',
            'So I sold my house and my car and moved back home. With my savings, my family and a lot of mentors, we built our first health kiosk in a shopping mall in Managua in 2016. Free health checks while you shop. Then came telemedicine and big partners.',
            "That company helped 400,000 people. What I learned: you need a real problem, the guts to start and the right people around you. That's it.",
            "And today you don't even have to sell your house. With AI, you can test your idea this week."
        ],
        button: null
    },
    {
        day: 5,
        subject: 'Who does each step? (the 3-owner rule)',
        preview: 'The simplest way to design an AI agent that is safe.',
        body: [
            "Most people think an AI agent does everything. It shouldn't. Here's the rule I use on every build.",
            'Take your task and write every step. Then give each step one of three owners. One: the agent does it. Reading, sorting, checking, filling forms. Two: the agent drafts, a person approves. Anything that reaches a patient, a payer or the chart. Three: a person only. Clinical decisions and real conversations.',
            "That's it. Now you have the design of your agent, and it's safe from day one, because a human checks everything that matters.",
            'Try it on the task you picked from my \"treat what kills first\" email. Ten minutes on a piece of paper.'
        ],
        button: null
    },
    {
        day: 7,
        subject: 'Build your first one in 5 days (free)',
        preview: 'One email and one move a day.',
        body: [
            "If you want to go from idea to a working prototype, I made a free 5-day course for exactly that.",
            'One short email a day and one move. Day 1 you find the problem. Day 2 you check people want it. Day 3 you build it in Claude. Day 4 you make it safe. Day 5 you get a one-page plan for your boss, or a business plan if you\'re building on your own.',
            "No code needed. Already did it? Then forward this to the coworker who keeps saying \"there has to be a better way\"."
        ],
        button: { text: 'Start the 5-day course', url: course }
    },
    {
        day: 10,
        subject: 'Build it right, or don\'t build it at all',
        preview: 'HIPAA in plain words: BAAs, made-up data and an off switch.',
        body: [
            "Healthcare isn't a playground. Real patients, real data. So here's the safe way to start, in plain words.",
            "One: test with made-up data. Never paste real patient information into a tool until it's approved.",
            'Two: a BAA. That\'s the contract that makes a vendor responsible for protecting patient data. No BAA, no real patient data. Ask every tool you use if they sign one.',
            'Three: a human checks before anything reaches a patient, a payer or the chart. And there\'s always an off switch.',
            "Doing it right isn't as scary or as expensive as people think. It's what lets IT and compliance say yes."
        ],
        button: null
    },
    {
        day: 13,
        subject: "Stop renting your problems",
        preview: 'What happened when a radiology group built its own fix.',
        body: [
            'A few years ago I sat with a group of radiologists who were frustrated with the software they were renting. It slowed them down every day.',
            "So we didn't buy another tool. We sat with them, mapped how the work really happens, and built their own platform, one module at a time. One routes cases to the right radiologist. One reads faxed orders. One fills shifts by text.",
            'Today it runs over 3 million reads a year.',
            "The lesson isn't about radiology. It's this: the people doing the work knew exactly what was broken. They just needed someone to build it with them. Your team knows too."
        ],
        button: null
    },
    {
        day: 16,
        subject: 'Put a number on it',
        preview: 'The one math problem that gets your idea approved.',
        body: [
            "Your boss won't say yes to \"AI is cool\". They'll say yes to a number.",
            'Here\'s the math: times a week × minutes each time × cost per hour. That\'s it.',
            'Example from my course: 60 referral faxes a week at 30 minutes each is 1,560 hours a year. About $40,000. Three quarters of a full-time person, just on faxes.',
            "Do this for your task. Then talk to three people who live with it and ask: \"When did this last happen to you?\" Write down what they say, word for word. A number plus a real quote: that's how ideas get approved, inside a company or as a business."
        ],
        button: null
    },
    {
        day: 20,
        subject: "You don't have to build it alone",
        preview: 'A place for healthcare builders.',
        body: [
            "Building something new can feel lonely. Especially in healthcare, where everyone tells you why it can't be done.",
            "So I'm bringing everyone into one circle: nurses, practice managers, clinic owners and founders who are building with AI. Share what you're working on, get unstuck, see what others built, and ask me anything.",
            'We battle this together.'
        ],
        button: { text: 'Join the community', url: () => skool() || course() },
        skoolOnly: true
    },
    {
        day: 24,
        subject: 'Build it yourself, or let me build it with you',
        preview: 'Two doors. Both are good.',
        body: [
            "This is the last email of the welcome series. From here you'll keep getting my weekly newsletter.",
            "By now you know how I think: pick the task that kills first, give every step an owner, keep it safe, put a number on it. You can build it.",
            'Door one: build it yourself. Everything I share is free, and it will stay free.',
            "Door two: if you run a clinic or a healthcare team and you want it built inside your own systems, with BAAs and approvals in place, that's what I do. Book 30 minutes and we'll look at your workflow together.",
            'Either way, reply and tell me what you\'re building. Start small, start today.'
        ],
        button: { text: 'Book a 30-min call', url: calendly }
    }
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function emailHtml(n, firstName, id) {
    const e = WELCOME[n - 1];
    const unsub = `${SITE}/api/subscribe?welcome_unsub=${encodeURIComponent(id)}`;
    const p = text => `<p style="margin:0 0 16px; font-size:16px; line-height:1.6; color:#1e293b;">${esc(text)}</p>`;
    // Email 9 needs the Skool link; without it, point to the course instead
    const body = e.skoolOnly && !skool()
        ? ["Building something new can feel lonely, especially in healthcare. You don't have to do it alone.", "If you haven't started the free 5-day course yet, it's the fastest way to go from idea to prototype. And reply anytime: I read every email.", 'We battle this together.']
        : e.body;
    const btn = e.button
        ? `<div style="margin:26px 0;"><a href="${esc(e.button.url())}" style="display:inline-block; padding:13px 22px; background:#4334dc; color:#ffffff; border-radius:10px; text-decoration:none; font-weight:700; font-size:15px;">${esc(e.skoolOnly && !skool() ? 'Start the 5-day course' : e.button.text)} →</a></div>`
        : '';
    const ig = instagram();
    return `<!DOCTYPE html>
<html><body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<span style="display:none; max-height:0; overflow:hidden;">${esc(e.preview)}</span>
<div style="max-width:560px; margin:0 auto; background:#ffffff; padding:32px 28px;">
    <div style="font-size:12px; font-weight:700; color:#4334dc; text-transform:uppercase; letter-spacing:1.2px; margin-bottom:18px;">Build your health idea with AI</div>
    ${p(`Hi ${firstName || 'there'},`)}
    ${body.map(p).join('\n    ')}
    ${btn}
    ${p('Marcos')}
    ${ig ? `<p style="margin:24px 0 0; font-size:14px; line-height:1.5; color:#475569;">I post short videos about this most days on <a href="${esc(ig)}" style="color:#4334dc;">Instagram</a>.</p>` : ''}
    <p style="margin:28px 0 0; font-size:12px; color:#94a3b8; text-align:center;">You joined at marcoslacayobosche.com.<br><a href="${esc(unsub)}" style="color:#94a3b8;">Stop these welcome emails</a></p>
</div></body></html>`;
}

async function sendEmail(n, { id, email, first_name }) {
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
            subject: WELCOME[n - 1].subject,
            htmlContent: emailHtml(n, first_name, id),
            tags: ['welcome', `welcome-${n}`]
        })
    });
    if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
}

const markSent = (id, n) => rest(`welcome_sequence?id=eq.${id}`, { method: 'PATCH', body: { last_sent: n, last_sent_at: new Date().toISOString() } });

/**
 * Start the sequence. Someone already in it isn't restarted.
 * @param {{email:string, firstName?:string, source?:string, utmSource?:string, inCourse?:boolean}} p
 * @returns {Promise<{enrolled:boolean, firstSent:boolean}>}
 */
export async function enrollInWelcome({ email, firstName, source, utmSource, inCourse = false }) {
    // Course students hear from the course first; their welcome starts after it
    const startsAt = new Date(Date.now() + (inCourse ? COURSE_LENGTH_DAYS * DAY_MS : 0)).toISOString();
    const rows = await rest(`welcome_sequence?on_conflict=email`, {
        method: 'POST',
        headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
        body: { email, first_name: firstName || null, source: source || null, utm_source: utmSource || null, started_at: startsAt }
    });
    const row = rows?.[0];
    if (!row) return { enrolled: false, firstSent: false };
    if (inCourse) return { enrolled: true, firstSent: false };   // the cron sends email 1 later

    await sendEmail(1, row);
    await markSent(row.id, 1);
    return { enrolled: true, firstSent: true };
}

/** Daily: send each person the next email they're due, never more than one per run. */
export async function welcomeDrip() {
    const summary = { due: 0, sent: 0, errors: 0 };
    const active = await rest(`welcome_sequence?unsubscribed=eq.false&last_sent=lt.${WELCOME.length}&started_at=lte.${new Date().toISOString()}&select=id,email,first_name,started_at,last_sent&limit=2000`);

    for (const row of active || []) {
        // +2h of slack so the daily cron doesn't miss someone who joined a bit later in the day
        const daysIn = Math.floor((Date.now() - new Date(row.started_at).getTime() + 2 * 60 * 60 * 1000) / DAY_MS);
        const next = row.last_sent + 1;
        if (WELCOME[next - 1].day > daysIn) continue;
        summary.due += 1;
        try {
            await sendEmail(next, row);
            await markSent(row.id, next);
            summary.sent += 1;
        } catch (e) {
            summary.errors += 1;
            console.warn('welcome drip failed:', row.email, e.message);
        }
    }
    return summary;
}

export async function welcomeUnsubscribe(req, res) {
    const id = String(req.query.welcome_unsub || '');
    if (/^[0-9a-f-]{36}$/i.test(id)) {
        await rest(`welcome_sequence?id=eq.${id}`, { method: 'PATCH', body: { unsubscribed: true } }).catch(e => console.warn('welcome unsubscribe failed:', e.message));
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(`<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribed</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; max-width:480px; margin:80px auto; padding:0 20px; color:#0f172a;">
<h1 style="font-size:24px;">You won't get any more welcome emails.</h1>
<p style="color:#475569; line-height:1.6;">To stop the weekly newsletter too, use the link at the bottom of any newsletter issue.</p>
<p><a href="${SITE}">marcoslacayobosche.com</a></p></body></html>`);
}
