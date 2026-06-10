// ==========================================================================
// POST /api/draft-post
// Body: { viral_input_id: UUID }
// Generates 4 platform-ready drafts (video script, LinkedIn, YouTube, IG/TT)
// from a single viral input, anchored to the input's best-matching POV pillar.
// ==========================================================================

import { callClaude } from '../lib/anthropic.js';

const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

const FORMATS = ['carousel', 'video-script', 'linkedin', 'article'];

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

    const systemPrompt = `You write content in the Alex Hormozi mold. Your job is to TEACH, not sell. Every post must give the reader something they can USE even if they never hire VytalMed.

Marcos Bosche is the face. He runs VytalMed — a healthcare-specialized software development agency — but he writes like an operator sharing hard-won lessons, not a vendor pitching. Anti-fluff. Framework-driven. Specific.

WORLD VIEW (anchor to these — never quote them verbatim):
- Most dev shops don't understand healthcare. Specialization compounds.
- SaaS solves 60% of any healthcare workflow. The other 40% is where everything breaks.
- AI alone doesn't fix a broken workflow. AI + the right workflow does.
- Every system speaks a different language (HL7, FHIR, DICOM, fax, custom CSV).
- Staff burn hours on work that should be automated.
- Generalists pay tuition every healthcare project.

${pillarBlock}

HORMOZI-STYLE VOICE RULES (apply to every format):
- Short sentences. Hard hits. Sentence fragments for emphasis. Like this.
- Frameworks and numbered lists: "3 mistakes", "5 questions", "2 ways". Numbered.
- Specific numbers and outcomes — never vague claims. ("20,000 faxes/day", "5-week", "80% in 80 days")
- Contrast pattern: "Most radiology groups do X. Smart operators do Y."
- Personal lessons: "I've seen this 100 times" / "Here's what works".
- Name real workflows (faxes, HL7, prior auth, denials, intake) over abstractions.
- NEVER use: "revolutionary", "game-changer", "unlock", "transformative", "leverage", "synergy".
- No emojis (sparingly, only when natural to the platform).
- TEACH first. The reader should learn something whether or not they ever hire VytalMed.

CTA STYLE — soft offer, not sales pitch:
DON'T write: "Hire us", "Book a demo", "Get a quote", "Schedule a call"
DO write things like:
- "Want to see where your workflow scores? Run the 60-second diagnostic → marcoslacayobosche.com/diagnose"
- "More healthcare ops teardowns → marcoslacayobosche.com/diagnose"
- "Score your own workflow → marcoslacayobosche.com/diagnose"
The CTA must feel like the NEXT dose of value, not a sales close.

You'll receive ONE source. Don't quote it. Use it as the entry point to teach.

DRAFT 1 — carousel (6-slide LinkedIn carousel — TEACHES a framework or lesson)
FIRST LINE of the carousel: pick the VytalMed module that best matches this topic.
Format exactly: THEME: vytaldocs | vytalbridge | vytalshift | vytalmap | vytalsurge | vytalform
  vytaldocs = faxes/documents/intake/OCR
  vytalbridge = HL7/FHIR/integration/interoperability (default if unsure)
  vytalshift = scheduling/capacity/shifts
  vytalmap = clinical data/reporting/dictation/charting
  vytalsurge = staffing/overflow/SLA/escalation
  vytalform = intake forms/screening/registration
Leave a blank line, then continue with the slides.

Pick ONE teachable framework from the source: "3 mistakes", "5 questions", "2 patterns", "3 fixes", "the 4-step breakdown".
  SLIDE 1 (HOOK): framework name or sharp claim. Max 8 words. Curiosity-driven.
    ✓ "3 mistakes most radiology groups make"  ✗ "VytalMed builds healthcare"
  SLIDE 2 (SETUP): what's at stake. Operator pain in 1-2 specific sentences. Use real numbers.
  SLIDE 3-5 (BODY): teach 3 things — 3 mistakes / 3 fixes / 3 questions / 3 patterns.
    Each slide: numbered header + 1-2 supporting lines that actually TEACH.
  SLIDE 6 (CTA): one lesson sentence + ONE soft offer:
    "Most groups don't know which one costs them the most.
     Run the 60-second diagnostic → marcoslacayobosche.com/diagnose"
Format: plain text, labeled "SLIDE N:" with blank lines between.

DRAFT 2 — video-script (60-90 sec talking-head, Submagic)
TEACH a specific lesson or framework. Don't pitch.
Structure:
  HOOK (5s): contrarian claim, framework name, or curiosity gap. No setup.
  TEACH (40s): the framework — 3 things, contrast pattern, or step-by-step. Numbered.
  EXAMPLE (20s): one specific story from the field. Real numbers.
  SOFT CTA (10s): "Want to see where your workflow scores? marcoslacayobosche.com/diagnose"
Include [pause], [emphasis], [b-roll: description] cues. Sentence fragments encouraged.

DRAFT 3 — linkedin (300-500 word text post — TEACHES)
Structure:
  HOOK (one line, blank line after): sentence fragment or contrarian claim
  TEACH (2-3 short paragraphs): the framework, list, or contrast. Numbered/bulleted lists. Each item teachable.
  PERSONAL (1 short paragraph): "I've seen this 100 times" — first-person operator voice
  SOFT CTA (last line, separate, blank line above):
    "Score your own workflow in 60 seconds → marcoslacayobosche.com/diagnose"
Plain text only. Short sentences. Line breaks. No jargon. The reader must learn ONE specific thing.

DRAFT 4 — article (1000-1500 word blog post — TEACHES a framework)
Structure:
  HEADLINE (markdown #): the lesson in one sharp line — names the framework
  INTRO (2-3 paragraphs): set up operator pain with specifics; preview what they'll learn
  3-4 SECTION SUBHEADERS (markdown ##): each is ONE element of the framework (~150-250 words). Teach + one short example.
  CLOSING (one short paragraph): the meta-lesson
  CTA (last line, separate): "Want to see where your workflow lands? Run the diagnostic → marcoslacayobosche.com/diagnose"
Tone: Hormozi explaining sales in long-form. Anti-fluff. Specific. Useful even to someone who never clicks.

RETURN JSON ONLY (no markdown fences):
{
  "carousel": "...",
  "video-script": "...",
  "linkedin": "...",
  "article": "..."
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
