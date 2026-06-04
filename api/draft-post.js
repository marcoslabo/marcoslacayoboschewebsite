// ==========================================================================
// POST /api/draft-post
// Body: { viral_input_id: UUID }
// Generates 4 platform-ready drafts (video script, LinkedIn, YouTube, IG/TT)
// from a single viral input, anchored to the input's best-matching POV pillar.
// ==========================================================================

import { callClaude } from '../lib/anthropic.js';

const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

const FORMATS = ['video-script', 'linkedin', 'youtube', 'instagram'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { viral_input_id } = req.body || {};
    if (!viral_input_id) {
        return res.status(400).json({ error: 'viral_input_id required' });
    }

    try {
        const viralInput = await fetchViralInput(viral_input_id);
        if (!viralInput) return res.status(404).json({ error: 'Viral input not found' });

        const pillar = viralInput.claude_alignment_pillar
            ? await fetchPillar(viralInput.claude_alignment_pillar)
            : null;

        const drafts = await generateDrafts(viralInput, pillar);

        // Persist all 4 as separate post_drafts rows
        const rows = FORMATS.map(angle => ({
            viral_input_id: viralInput.id,
            pov_pillar_slug: viralInput.claude_alignment_pillar || null,
            angle,
            draft_text: drafts[angle] || '',
            status: 'draft'
        }));

        const inserted = await insertDrafts(rows);

        // Mark viral input as drafted
        await markInputDrafted(viralInput.id);

        return res.status(200).json({ ok: true, drafts: inserted });
    } catch (e) {
        console.error('draft-post error:', e);
        const status = e.status || 500;
        return res.status(status).json({ error: e.message || 'Draft generation failed' });
    }
}

// ============================================================================
async function fetchViralInput(id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/viral_inputs?id=eq.${id}&select=*`, {
        headers: supabaseHeaders()
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
}

async function fetchPillar(slug) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pov_pillars?slug=eq.${slug}&select=*`, {
        headers: supabaseHeaders()
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
}

async function insertDrafts(rows) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/post_drafts`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(rows)
    });
    if (!r.ok) {
        console.error('Draft insert failed:', await r.text());
        return rows;
    }
    return await r.json();
}

async function markInputDrafted(id) {
    await fetch(`${SUPABASE_URL}/rest/v1/viral_inputs?id=eq.${id}`, {
        method: 'PATCH',
        headers: supabaseHeaders(),
        body: JSON.stringify({ status: 'drafted' })
    });
}

function supabaseHeaders() {
    const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || SUPABASE_ANON_KEY;
    return {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`
    };
}

// ============================================================================
async function generateDrafts(input, pillar) {
    const pillarBlock = pillar
        ? `POV PILLAR TO ANCHOR:
"${pillar.statement}"

Voice notes: ${pillar.voice_notes || 'operator-respecting, anti-hype, direct'}`
        : `POV PILLAR: anchor to the VytalMed thesis — most dev shops don't understand healthcare; we only build healthcare; SaaS solves 60%, we build the other 40%; specialization compounds.`;

    const systemPrompt = `You are VytalMed's content writer. VytalMed is a healthcare-specialized software development agency. Marcos Bosche is the face — operator-respecting, anti-vendor, direct, no hype.

You will receive ONE viral piece of healthcare content. Generate FOUR platform-ready drafts that REMIX it through the lens of the POV pillar below.

${pillarBlock}

RULES FOR ALL FOUR DRAFTS:
- Reference the viral piece (you can credit the source or paraphrase the claim)
- Add Marcos's operator-perspective twist
- End with a clear CTA to vytalmed.co/diagnose ("Diagnose your workflow in 60 seconds")
- No emojis except where natural for the platform (sparingly)
- No hype words ("revolutionary", "game-changer", "unlock", etc.)
- Specificity wins: name real workflows (faxes, HL7, prior auth, etc.) not abstractions

DRAFT 1 — video-script (for 60-90 sec talking-head, run through Submagic)
Format: spoken script with [pause], [emphasis], [b-roll: description] cues.
Structure: HOOK (5 sec) → CLAIM (15 sec) → STORY/EXAMPLE (30 sec) → POV (15 sec) → CTA (10 sec).
Open with a contrarian or surprising line. End with: "Diagnose your workflow at vytalmed.co/diagnose."

DRAFT 2 — linkedin (text long-form post, 300-500 words)
Structure: Hook line (one line, blank line after) → 2-3 short paragraphs telling the story → POV punchline → CTA on its own line.
Write the way Marcos talks: short sentences, line breaks, operator-respecting, no jargon padding. Use the viral piece as the entry point. Put the CTA on the last line — link as plain text "vytalmed.co/diagnose" not a URL (LinkedIn demotes external links in body — explain in a comment if needed).

DRAFT 3 — youtube (short title + description)
Format:
TITLE: <60 char max, hook + outcome>
DESCRIPTION: <120-180 words, summarize the take + link>
HASHTAGS: <5-8 relevant tags>

DRAFT 4 — instagram (90-150 word caption for Reels)
Format: opening hook on line 1, 2-3 short paragraphs, CTA at the bottom, then hashtags (8-12).

RETURN JSON ONLY (no markdown):
{
  "video-script": "...",
  "linkedin": "...",
  "youtube": "...",
  "instagram": "..."
}`;

    const userPrompt = `VIRAL INPUT:
Source: ${input.source_name}
Title: ${input.title}
URL: ${input.url}
Excerpt: ${input.excerpt || '(no excerpt)'}
Alignment summary (from scout): ${input.claude_summary || 'n/a'}`;

    const { text } = await callClaude({
        model: 'claude-opus-4-7',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
    });

    const parsed = parseJson(text);
    if (!parsed) {
        console.error('draft-post: could not parse JSON', text);
        throw new Error('Could not parse draft output');
    }
    return parsed;
}

function parseJson(text) {
    try { return JSON.parse(text); } catch {}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}
