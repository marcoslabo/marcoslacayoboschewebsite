// ==========================================================================
// /api/spark — Spark's public reads and writes, server-side
// The CRM tables (companies, contacts, briefs, activity_log) are closed to
// the public key, so the public Spark pages go through here.
//
//   POST { action: 'create', first_name, last_name, email, company_name, brief }
//        → { brief: { id, share_id } }   (adds the person to the CRM too)
//   POST { action: 'shared', id }        → marks a brief as Shared
//   POST { action: 'ai', kind, args }    → runs one of Spark's prompts (lib/spark-prompts.js)
//   GET  ?id=<brief uuid>                → the brief (result page after creating it)
//   GET  ?share=<share_id>               → the brief, and counts a view (share links)
// ==========================================================================

import { rest } from '../lib/supabase-server.js';
import { upsertLead, findOrCreateCompany } from '../lib/crm.js';
import { callClaude } from '../lib/anthropic.js';
import { SPARK_PROMPTS } from '../lib/spark-prompts.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const SHARE_RE = /^[a-z0-9]{4,16}$/i;

// Brief fields the public form may set
const BRIEF_FIELDS = [
    'title', 'problem_raw', 'problem_clean', 'hours_per_week', 'people_involved',
    'hourly_rate', 'improvement_percent', 'solution_level', 'level_reasoning', 'suggested_approach'
];

export default async function handler(req, res) {
    try {
        if (req.method === 'GET') return await getBrief(req, res);
        if (req.method === 'POST') {
            const { action } = req.body || {};
            if (action === 'create') return await createBrief(req, res);
            if (action === 'shared') return await markShared(req, res);
            if (action === 'ai') return await runPrompt(req, res);
            return res.status(400).json({ error: 'Unknown action' });
        }
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
        console.error('spark api error:', e.message);
        return res.status(e.status === 503 ? 503 : 500).json({ error: 'Something went wrong' });
    }
}

async function getBrief(req, res) {
    const { id, share } = req.query || {};
    let filter;
    if (id && UUID_RE.test(id)) filter = `id=eq.${id}`;
    else if (share && SHARE_RE.test(share)) filter = `share_id=eq.${share}`;
    else return res.status(400).json({ error: 'Missing brief id' });

    const rows = await rest(`briefs_with_roi?${filter}&select=*&limit=1`);
    const brief = rows?.[0];
    if (!brief) return res.status(404).json({ error: 'Brief not found' });

    if (share) {
        await rest(`briefs?id=eq.${brief.id}`, {
            method: 'PATCH',
            body: { share_link_views: (brief.share_link_views || 0) + 1 }
        });
        await logActivity(brief.id, 'Link Viewed', 'Shared brief viewed');
    }

    return res.status(200).json({ brief });
}

async function createBrief(req, res) {
    const { first_name, last_name, email, company_name, brief = {} } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail) || !first_name || !company_name || !brief.problem_raw) {
        return res.status(400).json({ error: 'Name, email, company and problem are required' });
    }

    const companyId = await findOrCreateCompany(String(company_name).slice(0, 200));

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const lead = await upsertLead({
        email: cleanEmail,
        firstName: String(first_name).trim().slice(0, 80),
        lastName: String(last_name || '').trim().slice(0, 80),
        stage: 'Graded',
        source: 'Grader',
        companyName: company_name,
        problem: String(brief.problem_raw).slice(0, 2000),
        extra: {
            next_action: 'Call',
            next_action_date: tomorrow.toISOString().split('T')[0],
            brevo_tag: 'spark-lead',
            side: 'nymbl'
        }
    });

    const row = { company_id: companyId, contact_id: lead.id, status: 'Draft', created_by: 'Website (Public)' };
    for (const field of BRIEF_FIELDS) {
        if (brief[field] !== undefined) row[field] = brief[field];
    }
    row.share_id = Math.random().toString(36).substring(2, 10);

    const created = await rest('briefs', { method: 'POST', body: row });
    const saved = created?.[0];
    await logActivity(saved.id, 'Created', 'Brief created');

    return res.status(200).json({ brief: { id: saved.id, share_id: saved.share_id } });
}

async function markShared(req, res) {
    const { id } = req.body || {};
    if (!UUID_RE.test(String(id || ''))) return res.status(400).json({ error: 'Missing brief id' });
    await rest(`briefs?id=eq.${id}`, { method: 'PATCH', body: { status: 'Shared' } });
    return res.status(200).json({ ok: true });
}

// Public, so only Spark's own prompts, with capped inputs and output
async function runPrompt(req, res) {
    const { kind, args } = req.body || {};
    const template = Object.prototype.hasOwnProperty.call(SPARK_PROMPTS, kind) ? SPARK_PROMPTS[kind] : null;
    if (!template || !Array.isArray(args) || args.length > 4) {
        return res.status(400).json({ error: 'Unknown prompt' });
    }

    const cleanArgs = args.map(a => (a === null || a === undefined ? '' : String(a).slice(0, 4000)));
    const { text } = await callClaude({
        model: 'claude-opus-4-7',
        messages: [{ role: 'user', content: template(...cleanArgs) }],
        max_tokens: 1024,
        temperature: 0.7
    });
    return res.status(200).json({ text });
}

async function logActivity(briefId, activityType, details) {
    try {
        await rest('activity_log', {
            method: 'POST',
            body: { brief_id: briefId, activity_type: activityType, details }
        });
    } catch (e) {
        console.warn('Spark activity log (non-fatal):', e.message);
    }
}
