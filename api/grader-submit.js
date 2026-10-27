// ==========================================================================
// POST /api/grader-submit
// Persists a Grader result + email (grader_submissions) and adds or updates
// the person in the CRM as stage "Graded", source "Grader". Service role only:
// the CRM tables are closed to the public key.
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
        practice,
        fallback_specialty,
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
    if (!analysis || typeof analysis.risk_score !== 'number') {
        return res.status(400).json({ error: 'Analysis payload required' });
    }

    const clip = v => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 100) : null);
    const cleanEmail = email.trim().toLowerCase();
    const specialty = practice?.specialty || fallback_specialty || null;

    const row = {
        practice_name: practice?.name || null,
        npi_number: practice?.npi || null,
        practice_metadata: practice ? {
            type: practice.type,
            specialty: practice.specialty,
            city: practice.city,
            state: practice.state,
            taxonomies: practice.taxonomies
        } : null,
        fallback_specialty: fallback_specialty || null,
        risk_score: analysis.risk_score,
        risk_grade: analysis.risk_grade || null,
        risk_breakdown: analysis.risk_breakdown || null,
        top_patterns: analysis.top_patterns || null,
        headline: analysis.headline || null,
        first_name: first_name.trim(),
        email: cleanEmail
    };

    try {
        // 1. Add or update the CRM contact: To contact, priority A, source
        //    Grader, with the 🩺 Graded badge (graded_at). They show first in
        //    Today → New people.
        //    Non-fatal: the person should still get their results.
        let contactId = null;
        try {
            const patterns = (analysis.top_patterns || []).slice(0, 3)
                .map((p, i) => `${i + 1}. ${p.title}${p.fix ? ` → ${p.fix}` : ''}`)
                .join('\n');

            const lead = await upsertLead({
                email: cleanEmail,
                firstName: first_name.trim(),
                stage: 'To contact',
                source: 'Grader',
                set: { graded_at: new Date().toISOString(), priority: 'A' },
                companyName: practice?.name || null,
                problem: `🩺 Grader · ${[practice?.name, specialty].filter(Boolean).join(' · ') || 'no practice match'}`
                    + ` · score ${analysis.risk_score}/100, grade ${analysis.risk_grade || '—'}`,
                note: `Grader top 3 workflows:\n${patterns || '(none returned)'}`,
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
                to: email.trim().toLowerCase(),
                firstName: first_name.trim(),
                practice,
                fallback_specialty,
                analysis
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
// Brevo transactional email — sends the results
// ============================================================================
async function sendReportEmail({ to, firstName, practice, fallback_specialty, analysis }) {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) {
        console.warn('BREVO_API_KEY not configured — skipping email send');
        return;
    }

    const senderEmail = process.env.GRADER_SENDER_EMAIL || 'marcos@marcoslacayobosche.com';
    const senderName  = process.env.GRADER_SENDER_NAME  || 'Marcos Lacayo Bosche';
    const calendlyUrl = process.env.GRADER_CALENDLY_URL || 'https://calendly.com/marcos-bosche-nymbl/30min';

    const practiceLabel = practice?.name
        ? practice.name
        : (fallback_specialty ? `${fallback_specialty} (specialty benchmark)` : 'your practice');

    const axisRows = [
        ['Automation Gap',    analysis.risk_breakdown?.automation ?? 0],
        ['Integration Burden', analysis.risk_breakdown?.integration ?? 0],
        ['Vendor Lock-in',    analysis.risk_breakdown?.vendor_lock_in ?? 0],
        ['AI Readiness',      analysis.risk_breakdown?.ai_readiness ?? 0],
        ['Patient Impact',    analysis.risk_breakdown?.patient_impact ?? 0]
    ];

    const patternsHtml = (analysis.top_patterns || []).map(p => `
        <div style="padding:16px; border-left:3px solid #6d28d9; background:#fafafa; border-radius:8px; margin-bottom:12px;">
            <div style="font-weight:700; font-size:15px; color:#0f172a; margin-bottom:6px;">${esc(p.title)}</div>
            <div style="font-size:13px; color:#475569; line-height:1.5; margin-bottom:6px;">${esc(p.why_it_applies)}</div>
            <div style="font-size:13px; color:#6d28d9; line-height:1.5; font-style:italic;">→ ${esc(p.fix)}</div>
        </div>
    `).join('');

    const axisHtml = axisRows.map(([label, v]) => `
        <tr>
            <td style="padding:6px 0; font-size:13px; color:#475569;">${esc(label)}</td>
            <td style="padding:6px 0; font-size:13px; color:#0f172a; font-weight:600; text-align:right;">${v} / 20</td>
        </tr>
    `).join('');

    const htmlContent = `
<!DOCTYPE html>
<html><body style="margin:0; padding:0; background:#f8fafc; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px; margin:0 auto; background:white; padding:32px 28px;">
    <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:10px;">🩺 Workflow Grader by Marcos Lacayo Bosche</div>
    <h1 style="font-size:24px; font-weight:800; color:#0f172a; margin:0 0 4px; letter-spacing:-0.02em;">Hi ${esc(firstName)} — here are your results</h1>
    <p style="font-size:14px; color:#64748b; margin:0 0 24px;">For <strong>${esc(practiceLabel)}</strong></p>

    <div style="background:linear-gradient(135deg,#faf5ff,#f5f3ff); padding:24px; border-radius:14px; margin-bottom:24px;">
        <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Workflow Risk Score</div>
        <div style="font-size:48px; font-weight:800; color:#6d28d9; line-height:1; margin-bottom:6px;">${analysis.risk_score} <span style="font-size:18px; font-weight:600; color:#0f172a;">/ 100</span></div>
        <div style="display:inline-block; padding:4px 12px; background:#ede9fe; color:#6d28d9; border-radius:999px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-right:8px;">Grade ${esc(analysis.risk_grade)}</div>
        <span style="font-size:16px; font-weight:700; color:#0f172a;">${esc(analysis.headline || '')}</span>
    </div>

    <h2 style="font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin:24px 0 10px;">Axis Breakdown</h2>
    <table style="width:100%; border-collapse:collapse;">${axisHtml}</table>

    <h2 style="font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin:28px 0 12px;">Top 3 Workflows We'd Fix First</h2>
    ${patternsHtml}

    <div style="background:#0f172a; padding:24px; border-radius:14px; text-align:center; margin:32px 0 8px;">
        <div style="color:white; font-size:16px; font-weight:700; margin-bottom:6px;">Want to see #1 actually working?</div>
        <div style="color:#94a3b8; font-size:13px; margin-bottom:16px;">I'll build a free working demo of this workflow for your group. No connection to your systems needed. I build 4 free demos a month.</div>
        <a href="${esc(calendlyUrl)}" style="display:inline-block; padding:14px 24px; background:white; color:#0f172a; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;">Book my free demo →</a>
    </div>

    <p style="font-size:12px; color:#94a3b8; text-align:center; margin-top:32px;">Marcos Lacayo Bosche · Built with VytalMed × Nymbl<br>You got this email because you ran the Workflow Grader at marcoslacayobosche.com/diagnose.</p>
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
            subject: `Your Workflow Risk Score for ${practiceLabel}`,
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
