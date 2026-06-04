// ==========================================================================
// POST /api/grader-submit
// Persists a Grader result + email to Supabase (grader_submissions table).
// Server-side so we can use the service role to bypass RLS edge cases.
// ==========================================================================

const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
// Same anon key already shipped in spark/js/config.js — public by design (RLS protects).
const SUPABASE_ANON_KEY_FALLBACK = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY_FALLBACK;

    const {
        practice,
        fallback_specialty,
        analysis,
        first_name,
        email
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
        email: email.trim().toLowerCase()
    };

    const headers = {
        'Content-Type': 'application/json',
        'apikey': apiKey,
        'Authorization': `Bearer ${apiKey}`,
        'Prefer': 'return=representation'
    };

    try {
        // 1. Create a contact so this lead flows into the CRM's Today's Actions / Overdue list
        //    Same shape as the legacy Spark flow — keeps the existing source CHECK constraint happy.
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const problemSummary = analysis.headline
            ? `🩺 Diagnose · ${analysis.headline} (score ${analysis.risk_score}/100, grade ${analysis.risk_grade})${practice?.name ? ` · ${practice.name}` : ''}`
            : `🩺 Diagnose submission · score ${analysis.risk_score}/100`;

        const contactRow = {
            first_name: first_name.trim(),
            last_name: '',
            email: email.trim().toLowerCase(),
            source: 'Website (Spark)',
            is_lead: true,
            status: 'New',
            next_action: 'Call',
            next_action_date: tomorrow.toISOString().split('T')[0],
            problem: problemSummary,
            brevo_tag: 'diagnose-lead',
            brevo_synced: false
        };

        let contactId = null;
        try {
            const contactResp = await fetch(`${SUPABASE_URL}/rest/v1/contacts`, {
                method: 'POST', headers, body: JSON.stringify(contactRow)
            });
            if (contactResp.ok) {
                const c = await contactResp.json();
                contactId = c[0]?.id || null;
            } else {
                console.warn('Contact creation failed (non-fatal):', contactResp.status, await contactResp.text());
            }
        } catch (e) {
            console.warn('Contact creation threw (non-fatal):', e.message);
        }

        // 2. Insert the grader_submissions row (with optional contact_id backlink)
        if (contactId) row.contact_id = contactId;

        const resp = await fetch(`${SUPABASE_URL}/rest/v1/grader_submissions`, {
            method: 'POST', headers, body: JSON.stringify(row)
        });

        if (!resp.ok) {
            const errBody = await resp.text();
            console.error('Supabase insert failed:', resp.status, errBody);
            return res.status(resp.status).json({ error: 'Failed to save submission' });
        }

        const inserted = await resp.json();

        // 3. Send the 1-pager email via Brevo. Awaited because Vercel serverless
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

        return res.status(200).json({
            id: inserted[0]?.id,
            contact_id: contactId,
            email_sent: emailSent,
            ok: true
        });
    } catch (e) {
        console.error('Grader submit error:', e);
        return res.status(500).json({ error: 'Failed to save submission' });
    }
}

// ============================================================================
// Brevo transactional email — sends the 1-pager
// ============================================================================
async function sendReportEmail({ to, firstName, practice, fallback_specialty, analysis }) {
    const brevoKey = process.env.BREVO_API_KEY;
    if (!brevoKey) {
        console.warn('BREVO_API_KEY not configured — skipping email send');
        return;
    }

    const senderEmail = process.env.GRADER_SENDER_EMAIL || 'marcos@marcoslacayobosche.com';
    const senderName  = process.env.GRADER_SENDER_NAME  || 'Marcos Bosche (VytalMed)';
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
    <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1.5px; margin-bottom:10px;">🩺 VytalMed Workflow Grader</div>
    <h1 style="font-size:24px; font-weight:800; color:#0f172a; margin:0 0 4px; letter-spacing:-0.02em;">Hi ${esc(firstName)} — here's your report</h1>
    <p style="font-size:14px; color:#64748b; margin:0 0 24px;">For <strong>${esc(practiceLabel)}</strong></p>

    <div style="background:linear-gradient(135deg,#faf5ff,#f5f3ff); padding:24px; border-radius:14px; margin-bottom:24px;">
        <div style="font-size:11px; font-weight:700; color:#6d28d9; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">Workflow Risk Score</div>
        <div style="font-size:48px; font-weight:800; color:#6d28d9; line-height:1; margin-bottom:6px;">${analysis.risk_score} <span style="font-size:18px; font-weight:600; color:#0f172a;">/ 100</span></div>
        <div style="display:inline-block; padding:4px 12px; background:#ede9fe; color:#6d28d9; border-radius:999px; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; margin-right:8px;">Grade ${esc(analysis.risk_grade)}</div>
        <span style="font-size:16px; font-weight:700; color:#0f172a;">${esc(analysis.headline || '')}</span>
    </div>

    <h2 style="font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin:24px 0 10px;">Axis Breakdown</h2>
    <table style="width:100%; border-collapse:collapse;">${axisHtml}</table>

    <h2 style="font-size:13px; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:1px; margin:28px 0 12px;">Top 3 Patterns We'd Fix in Your 5-Week Playback</h2>
    ${patternsHtml}

    <div style="background:#0f172a; padding:24px; border-radius:14px; text-align:center; margin:32px 0 8px;">
        <div style="color:white; font-size:16px; font-weight:700; margin-bottom:6px;">Want to talk through this?</div>
        <div style="color:#94a3b8; font-size:13px; margin-bottom:16px;">5 weeks from now you could have a working demo. Or another quarter of scoping.</div>
        <a href="${esc(calendlyUrl)}" style="display:inline-block; padding:14px 24px; background:white; color:#0f172a; border-radius:10px; text-decoration:none; font-weight:700; font-size:14px;">Book your 30-min playback consult →</a>
    </div>

    <p style="font-size:12px; color:#94a3b8; text-align:center; margin-top:32px;">VytalMed · Built by healthcare engineers, for healthcare operators<br>You got this email because you ran the Workflow Grader at marcoslacayobosche.com/diagnose.</p>
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
