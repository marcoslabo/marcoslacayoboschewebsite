// ==========================================================================
// CRM helper (Supabase `contacts` table, service role only)
// Every public lead source writes through here: the Grader, newsletter
// sign-ups, the daily beehiiv sync and Spark.
// ==========================================================================

import { rest } from './supabase-server.js';

// Pipeline order. Nurture and Not a Fit sit outside it.
export const STAGES = [
    'To contact', 'Reached out', 'Replied', 'Graded', 'Call booked',
    'Demo built', 'Demo reviewed', 'Handed to Nymbl'
];

const ROLE_LABELS = {
    'physician': 'Physician',
    'operations-leader': 'Operations leader',
    'practice-owner': 'Practice owner',
    'builder': 'Builder / founder',
    'other': 'Other'
};

/**
 * Add or update a lead.
 *
 * New contacts get `stage`. Existing contacts only ever move forward:
 * a contact already at Call booked stays there when they grade again, and
 * Not a Fit is left alone (that's a call you made by hand).
 *
 * @param {object} opts
 * @param {string} opts.email
 * @param {string} opts.stage            One of STAGES, or 'Nurture'.
 * @param {string} opts.source           Contact source (CHECK-constrained).
 * @param {string} [opts.firstName]
 * @param {string} [opts.lastName]
 * @param {string} [opts.problem]        One-line summary shown on the contact.
 * @param {string} [opts.note]           Appended to the contact's notes, dated.
 * @param {string} [opts.companyName]
 * @param {string} [opts.utmSource]
 * @param {string} [opts.utmCampaign]
 * @param {object} [opts.extra]          Extra columns for new contacts only.
 * @returns {Promise<{id:string|null, created:boolean, stage:string|null}>}
 */
export async function upsertLead({
    email, stage, source, firstName, lastName, problem, note,
    companyName, utmSource, utmCampaign, extra = {}
} = {}) {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail) return { id: null, created: false, stage: null };

    const existing = await findContactByEmail(cleanEmail);
    const datedNote = note ? `${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${note}` : null;

    if (!existing) {
        const companyId = companyName ? await findOrCreateCompany(companyName) : null;
        const rows = await rest('contacts', {
            method: 'POST',
            body: {
                first_name: firstName || '',
                last_name: lastName || '',
                email: cleanEmail,
                is_lead: true,
                owner: 'marcos',
                status: stage,
                source,
                problem: problem || null,
                notes: datedNote,
                company_id: companyId,
                utm_source: utmSource || null,
                utm_campaign: utmCampaign || null,
                brevo_synced: true,
                ...extra
            }
        });
        return { id: rows?.[0]?.id || null, created: true, stage };
    }

    const updates = {};
    if (shouldAdvance(existing.status, stage)) updates.status = stage;
    if (!existing.first_name && firstName) updates.first_name = firstName;
    if (!existing.company_id && companyName) updates.company_id = await findOrCreateCompany(companyName);
    if (!existing.utm_source && utmSource) updates.utm_source = utmSource;
    if (!existing.utm_campaign && utmCampaign) updates.utm_campaign = utmCampaign;
    if (problem) updates.problem = problem;
    if (datedNote) updates.notes = existing.notes ? `${datedNote}\n\n${existing.notes}` : datedNote;

    if (Object.keys(updates).length) {
        await rest(`contacts?id=eq.${existing.id}`, { method: 'PATCH', body: updates });
    }
    return { id: existing.id, created: false, stage: updates.status || existing.status };
}

function shouldAdvance(current, next) {
    if (!next || current === next || current === 'Not a Fit') return false;
    if (next === 'Nurture') return !current;
    if (!current || current === 'Nurture') return true;
    return STAGES.indexOf(next) > STAGES.indexOf(current);
}

/**
 * Newsletter sign-up: new people land in Nurture, source Newsletter.
 * Existing contacts keep their stage.
 */
export async function ensureNewsletterContact({ email, firstName, lastName, role, source, utmSource, utmCampaign } = {}) {
    const roleLabel = ROLE_LABELS[role] ? ` · ${ROLE_LABELS[role]}` : '';
    const { id, created } = await upsertLead({
        email,
        firstName,
        lastName,
        stage: 'Nurture',
        source: 'Newsletter',
        utmSource,
        utmCampaign,
        extra: {
            next_action: 'None',
            problem: `📬 Newsletter sign-up · ${source || 'website'}${roleLabel}`,
            brevo_tag: 'newsletter'
        }
    });
    return { id, created };
}

/**
 * Flag a contact as engaged (e.g. clicked a newsletter link) without
 * touching their stage.
 */
export async function markEngaged(email, reason) {
    const existing = await findContactByEmail(String(email || '').trim().toLowerCase());
    if (!existing || existing.high_intent) return false;

    await rest(`contacts?id=eq.${existing.id}`, {
        method: 'PATCH',
        body: { high_intent: true, intent_reason: reason }
    });
    return true;
}

export async function findOrCreateCompany(name) {
    const cleanName = String(name || '').trim();
    if (!cleanName) return null;

    const found = await rest(`companies?name=ilike.${encodeURIComponent(cleanName)}&select=id&limit=1`);
    if (found?.length) return found[0].id;

    const created = await rest('companies', { method: 'POST', body: { name: cleanName, status: 'Prospect' } });
    return created?.[0]?.id || null;
}

async function findContactByEmail(email) {
    if (!email) return null;
    const rows = await rest(
        `contacts?email=eq.${encodeURIComponent(email)}&select=id,status,first_name,company_id,notes,high_intent,utm_source,utm_campaign&limit=1`
    );
    return rows?.[0] || null;
}
