// ==========================================================================
// POST /api/grader-submit  (AI agent finder; URL kept for analytics)
// Body: { analysis: {best, alternatives}, role?, specialty?, first_name, email, newsletter? }
// Saves the agent plan + email (grader_submissions), adds or updates the person
// in the CRM, and emails them the plan. The visitor's workflow text is not
// sent here, so it is never stored. Service role only: the CRM tables are
// closed to the public key.
// If the person ticks the newsletter box, also subscribes them to beehiiv.
// ==========================================================================

import { subscribe } from '../lib/beehiiv.js';
import { rest } from '../lib/supabase-server.js';
import { upsertLead } from '../lib/crm.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        role,
        specialty: rawSpecialty,
        analysis,
        first_name,
        email,
        newsletter,
        utm_source,
        utm_campaign
    } = req.body || {};

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    if (!first_name || !first_name.trim()) {
        return res.status(400).json({ error: 'First name required' });
    }
    if (!analysis?.best?.name) {
        return res.status(400).json({ error: 'Agent plan required' });
    }

    const clip = (v, max = 100) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const cleanEmail = email.trim().toLowerCase();
    const specialty = clip(rawSpecialty, 80);
    const plan = {
        best: {
            name: clip(analysis.best.name, 120),
            does: clip(analysis.best.does, 600),
            steps: (Array.isArray(analysis.best.steps) ? analysis.best.steps : [])
                .map(step => clip(step, 160)).filter(Boolean).slice(0, 4),
            connects_to: clip(analysis.best.connects_to, 300),
            human_step: clip(analysis.best.human_step, 300)
        },
        alternatives: (Array.isArray(analysis.alternatives) ? analysis.alternatives : []).slice(0, 2)
            .map(a => ({ name: clip(a?.name, 120), why: clip(a?.why, 300) }))
            .filter(a => a.name)
    };

    // The old score columns stay empty; the plan lives in top_patterns / headline
    const row = {
        practice_metadata: { role: clip(role, 40), specialty },
        fallback_specialty: specialty,
        top_patterns: plan,
        headline: plan.best.name,
        first_name: first_name.trim(),
        email: cleanEmail
    };

    try {
        // 1. Add or update the CRM contact    try {
        // 1. Add or update the CRM contact: To contact, priority A, source
        //    Grader, with the 🩺 Graded badge (graded_at). They show first in
        //    Today → New people.
        //    Non-fatal: the person should still get their results.
        let contactId = null;
        try {
            const runnersUp = plan.alternatives.map(a => a.name).join(', ');

            const lead = await upsertLead({
                email: cleanEmail,
                firstName: first_name.trim(),
                stage: 'To contact',
                source: 'Grader',
                set: { graded_at: new Date().toISOString(), priority: 'A' },
                problem: `🤖 Agent finder · best fit: ${plan.best.name}`
                    + `${[clip(role, 40), specialty].filter(Boolean).length ? ` · ${[clip(role, 40), specialty].filter(Boolean).join(' · ')}` : ''}`,
                note: `Agent finder plan: ${plan.best.name}. ${plan.best.does || ''}`
                    + `${plan.best.connects_to ? ` Connects to: ${plan.best.connects_to}.` : ''}`
                    + `${runnersUp ? ` Also: ${runnersUp}.` : ''}`,
                utmSource: clip(utm_source),
                utmCampaign: clip(utm_campaign),
                extra: {
                    brevo_tag: 'diagnose-lead',
                    side: 'nymbl'
                }
            });
            contactId = lead.id;
        } catch (e) {
            console.warn('CRM contact (non-fatal):', e.message);
        }

        // 2. Insert the grader_submissions row (with optional contact_id backlink)
        if (contactId) row.contact_id = contactId;

        let inserted;
        try {
            inserted = await rest('grader_submissions', { method: 'POST', body: row });
        } catch (e) {
            console.error('Supabase insert failed:', e.message);
            return res.status(e.status === 503 ? 503 : 500).json({ error: 'Failed to save submission' });
        }

        // 3. Send the results email via Brevo. Awaited because Vercel serverless
        //    will kill non-awaited async work when the function returns.
        let emailSent = false;
        try {
            await sendReportEmail({
                to: cleanEmail,
                firstName: first_name.trim(),
                plan
            });
            emailSent = true;
        } catch (err) {
            console.warn('Report email send failed (non-fatal):', err.message);
        }

        // 4. Newsletter opt-in (only when they ticked the box)
        let subscribed = false;
        if (newsletter === true) {
            try {
                await subscribe({ email: cleanEmail, firstName: first_name.trim(), source: 'diagnose' });
                subscribed = true;
            } catch (err) {
                console.warn('Newsletter subscribe failed (non-fatal):', err.message);
            }
        }

        return res.status(200).json({
            id: inserted[0]?.id,
            contact_id: contactId,
            email_sent: emailSent,
            subscribed,
            ok: true
        });
    } catch (e) {
        console.error('Grader submit error:', e);
        return res.status(500).json({ error: 'Failed to save submission' });
    }
}

// ============================================================================
// Brevo transactional email — sends the agent plan
// ============================================================================
async function sendReportEmail({ to, firstName, plan }) {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) {
        console.warn('BREVO_API_KEY not configured — skipping email send');
        return;
    }

    const senderEmail = process.env.GRADER_SENDER_EMAIL || 'marcos@marcoslacayobosche.com';
    const senderName  = process.env.GRADER_SENDER_NAME  || 'Marcos Lacayo Bosche';
    const calendlyUrl = process.env.GRADER_CALENDLY_URL || 'https://calendly.com/marcos-bosche-nymbl/30min';

    const fact = (label, value) => value ? `
        <div style="background:#f8fafc; border-radius:10px; padding:12px 14px; margin-bottom:10px;">
            <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.6px; margin-bottom:2px;">${esc(label)}</div>
            <div style="font-size:14px; color:#0f172a; line-height:1.5;">${esc(value)}</div>
        </div>` : '';

    const alternativesHtml = plan.alternatives.map(a => `
        <div style="padding:14px 16px; border-left:3px solid #6d28d9; background:#fafafa; border-radius:8px; margin-bottom:10px;">
            <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:4px;">${esc(a.name)}</div>
            <div style="font-size:13px; color:#475569; line-height:1.5;">${esc(a.why)}</div>
        </div>
    `).join('');

    const htmlContent = `
<!DOCTYPE html>
<html><body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px; margin:0 auto; background:white; padding:32px 28px;">
    <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:10px;">🤖 AI agent finder by Marcos Lacayo Bosche</div>
    <h1 style="font-size:24px; font-weight:800; color:#0f172a; margin:0 0 20px; letter-spacing:-0.02em;">Hi ${esc(firstName)}, here's your AI agent plan</h1>

    <div style="background:linear-gradient(135deg,#faf5ff,#f5f3ff); padding:22px; border-radius:14px; margin-bottom:18px;">
        <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Your best first agent</div>
        <div style="font-size:22px; font-weight:800; color:#0f172a; margin-bottom:8px;">${esc(plan.best.name)}</div>
        <div style="font-size:15px; color:#334155; line-height:1.55;">${esc(plan.best.does)}</div>
    </div>

    ${plan.best.steps.length ? `
    <h2 style="font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin:6px 0 10px;">How it would work</h2>
    <ol style="margin:0 0 18px; padding-left:20px; font-size:14px; color:#0f172a; line-height:1.6;">
        ${plan.best.steps.map(step => `<li style="margin-bottom:4px;">${esc(step)}</li>`).join('')}
    </ol>` : ''}

    ${fact('Connects to', plan.best.connects_to)}
    ${fact('A person approves', plan.best.human_step)}

    ${alternativesHtml ? `<h2 style="font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin:26px 0 10px;">Also worth a look</h2>${alternativesHtml}` : ''}

    <div style="border:1px solid #e2e8f0; padding:18px 20px; border-radius:14px; margin:28px 0 0;">
        <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Your free workbook</div>
        <div style="font-size:15px; font-weight:700; color:#0f172a; margin-bottom:4px;">The AI Agent Map</div>
        <div style="font-size:13px; color:#475569; line-height:1.5; margin-bottom:10px;">Map one workflow, find where an AI agent can save your team time, what it connects to and who approves it. 4 pages, 30 minutes.</div>
        <a href="https://www.marcoslacayobosche.com/downloads/ai-agent-map.pdf" style="font-size:14px; font-weight:700; color:#6d28d9; text-decoration:none;">Download the workbook →</a>
    </div>

    <div style="background:#0f172a; padding:24px; border-radius:14px; text-align:center; margin:32px 0 8px;">
        <div style="color:white; font-size:16px; font-weight:700; margin-bottom:6px;">Want this agent working for your team?</div>
        <div style="color:#94a3b8; font-size:13px; margin-bottom:16px;">I'll build a working version around your real workflow. No connection to your systems and no patient data. Built under a BAA when it goes live.</div>
        <a href="${esc(calendlyUrl)}" style="display:inline-block; padding:14px 24px; background:white; color:#0f172a; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;">Book a 30-min call to build it</a>
    </div>

    <p style="font-size:12px; color:#94a3b8; text-align:center; margin-top:32px;">Marcos Lacayo Bosche · Built with VytalMed × Nymbl<br>You got this email because you used the AI agent finder at marcoslacayobosche.com/diagnose.</p>
</div></body></html>`;

    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'api-key': brevoKey,
            'accept': 'application/json'
        },
        body: JSON.stringify({
            sender: { name: senderName, email: senderEmail },
            to: [{ email: to, name: firstName }],
            subject: `Your AI agent plan: ${plan.best.name}`,
            htmlContent
        })
    });

    if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Brevo ${resp.status}: ${errText}`);
    }
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
