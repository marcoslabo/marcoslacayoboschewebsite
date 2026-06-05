// ==========================================================================
// POST /api/capture
// Body: { input: "URL or text", formats: ["carousel","video-script","linkedin","article"] }
//
// 1. If input is a URL, fetches the page and extracts title + main text.
//    Otherwise treats input as raw text the user pasted.
// 2. Inserts into viral_inputs with source='capture'.
// 3. Generates the requested format drafts via Claude, inserts into post_drafts.
// 4. Returns { viral_input_id, drafts_created }.
// ==========================================================================

import { callClaude } from '../lib/anthropic.js';

const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

const VALID_FORMATS = ['carousel', 'video-script', 'linkedin', 'article'];

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { input, formats } = req.body || {};
    if (!input || typeof input !== 'string') {
        return res.status(400).json({ error: 'input (URL or text) is required' });
    }
    const cleanFormats = (formats || VALID_FORMATS).filter(f => VALID_FORMATS.includes(f));
    if (cleanFormats.length === 0) {
        return res.status(400).json({ error: 'At least one valid format required' });
    }

    try {
        // 1. Resolve input → { title, content, url }
        const trimmed = input.trim();
        const looksLikeUrl = /^https?:\/\//i.test(trimmed);
        let source = { title: '', content: trimmed, url: null };
        if (looksLikeUrl) {
            try {
                source = await fetchUrlContent(trimmed);
            } catch (e) {
                // If URL fetch fails (LinkedIn auth wall, Twitter, etc.), fall back to using URL itself as text
                source = { title: trimmed.slice(0, 100), content: `(URL — fetch failed, using URL only): ${trimmed}`, url: trimmed };
            }
        } else {
            // Use first line / 80 chars as title
            const firstLine = trimmed.split('\n')[0].trim();
            source.title = firstLine.slice(0, 100);
            source.content = trimmed.slice(0, 3000);
        }

        // 2. Insert viral_input row
        const viralInputRow = {
            source: 'capture',
            source_name: 'Manual Capture',
            url: source.url || `capture://${Date.now()}`,  // viral_inputs.url is UNIQUE; synthesize one for text captures
            title: source.title || 'Untitled capture',
            excerpt: source.content.slice(0, 500),
            published_at: new Date().toISOString(),
            engagement_signal: null,
            claude_score: null,
            claude_alignment_pillar: null,
            claude_summary: null,
            status: 'new'
        };

        const viralResp = await fetch(`${SUPABASE_URL}/rest/v1/viral_inputs?on_conflict=url`, {
            method: 'POST',
            headers: { ...supabaseHeaders(), 'Prefer': 'return=representation,resolution=merge-duplicates' },
            body: JSON.stringify(viralInputRow)
        });
        if (!viralResp.ok) {
            const errBody = await viralResp.text();
            throw new Error(`viral_inputs insert failed: ${viralResp.status} ${errBody.slice(0, 200)}`);
        }
        const inserted = await viralResp.json();
        const viralInputId = inserted[0]?.id;
        if (!viralInputId) throw new Error('No viral_input_id returned');

        // 3. Generate drafts (Claude)
        const drafts = await generateDrafts(source, cleanFormats);

        // 4. Insert drafts
        const rows = cleanFormats.map(angle => ({
            viral_input_id: viralInputId,
            pov_pillar_slug: null,
            angle,
            draft_text: drafts[angle] || '',
            status: 'draft'
        }));
        const draftsResp = await fetch(`${SUPABASE_URL}/rest/v1/post_drafts`, {
            method: 'POST',
            headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
            body: JSON.stringify(rows)
        });
        if (!draftsResp.ok) {
            const errBody = await draftsResp.text();
            console.error('post_drafts insert failed:', errBody);
            throw new Error(`Could not save drafts: ${errBody.slice(0, 200)}`);
        }

        // Status stays 'new' so the capture shows up in the Inbox's default
        // "New" filter. Users can manually mark items 'drafted' or 'archived'
        // once they've reviewed.

        return res.status(200).json({
            ok: true,
            viral_input_id: viralInputId,
            drafts_created: cleanFormats.length,
            formats: cleanFormats
        });
    } catch (e) {
        console.error('Capture error:', e);
        return res.status(500).json({ error: e.message || 'Capture failed' });
    }
}

// ============================================================================
async function fetchUrlContent(url) {
    const r = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; VytalMedCapture/1.0; +https://vytalmed.co)',
            'Accept': 'text/html,application/xhtml+xml'
        },
        redirect: 'follow'
    });
    if (!r.ok) throw new Error(`URL fetch ${r.status}`);
    const html = await r.text();

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? decodeEntities(titleMatch[1]).trim().slice(0, 200) : '';

    // OG description (better than scraping body for many sites)
    const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const ogDesc = ogDescMatch ? decodeEntities(ogDescMatch[1]).trim() : '';

    // Strip scripts/styles, then strip remaining tags
    const stripped = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const content = (ogDesc ? ogDesc + '\n\n' : '') + decodeEntities(stripped).slice(0, 2500);
    return { title, content, url };
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
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
// Claude — generate the requested formats
// ============================================================================
async function generateDrafts(source, formats) {
    const formatBlocks = formats.map(f => FORMAT_SPECS[f]).filter(Boolean).join('\n\n---\n\n');

    const systemPrompt = `You are VytalMed's content writer. VytalMed is a healthcare-specialized software development agency. Marcos Bosche is the face — operator-respecting, anti-vendor, direct, no hype.

You're given ONE piece of source content. Generate ONLY the formats requested below, remixing the source through VytalMed's POV. Anchor to one or more of these pillars:

- "Most dev shops don't understand healthcare. We only build healthcare."
- "Not a SaaS platform. Not a consultancy. A dev team that compounds."
- "By week 5, you're iterating. Not deciding."
- "Specialization compounds. Generalists pay tuition every project."
- "AI alone doesn't fix a broken workflow."
- "SaaS ships 60% of a solution — you adjust to the software, not the other way around."
- "Every system speaks a different language."
- "Staff spend hours on work that should be automated."

UNIVERSAL RULES (apply to ALL formats):
- Reference the source's claim/angle without copying verbatim
- Operator-perspective twist with VytalMed POV
- End with CTA: "Diagnose your workflow at marcoslacayobosche.com/diagnose"
- No emojis (or sparingly, only where natural to the platform)
- No hype words ("revolutionary", "game-changer", "unlock")
- Specificity wins: name real workflows (faxes, HL7, prior auth) over abstractions

FORMATS REQUESTED:

${formatBlocks}

RETURN STRICT JSON ONLY (no markdown fences), with ONE key per requested format:
{
  ${formats.map(f => `"${f}": "..."`).join(',\n  ')}
}`;

    const userPrompt = `SOURCE CONTENT:
${source.url ? `URL: ${source.url}` : ''}
${source.title ? `Title: ${source.title}` : ''}

${source.content}`;

    const { text } = await callClaude({
        model: 'claude-opus-4-7',
        max_tokens: 6000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
    });

    const parsed = parseJson(text);
    if (!parsed) throw new Error('Could not parse Claude draft output');
    return parsed;
}

const FORMAT_SPECS = {
    'carousel': `📊 CAROUSEL (6-slide LinkedIn carousel, designed for Canva PDF export)
Format as 6 slides, numbered. Each slide is a short headline + 1-2 supporting lines.
Slide structure:
  SLIDE 1 (HOOK): one sharp claim, max 8 words, no period
  SLIDE 2 (SETUP): the operator pain in 1-2 sentences
  SLIDE 3-5 (BODY): three substantive points — each a short headline + 1-2 supporting lines
  SLIDE 6 (CTA): one-line takeaway + "Diagnose your workflow → marcoslacayobosche.com/diagnose"
Render as plain text with "SLIDE N:" labels and blank lines between.`,

    'video-script': `🎬 VIDEO-SCRIPT (60-90 second talking-head, processed via Submagic)
Spoken script with [pause], [emphasis], [b-roll: description] cues.
Structure: HOOK (5s) → CLAIM (15s) → STORY/EXAMPLE (30s) → POV (15s) → CTA (10s)
Open with a contrarian or surprising line. End with: "Diagnose your workflow at marcoslacayobosche.com/diagnose."`,

    'linkedin': `💼 LINKEDIN (300-500 word text post)
Structure: Hook line (one line, blank line after) → 2-3 short paragraphs telling the story → POV punchline → CTA on its own line.
Short sentences. Line breaks. Operator-respecting. No jargon padding.
Plain text only — no markdown. End with the CTA "marcoslacayobosche.com/diagnose" on its own line.`,

    'article': `📝 ARTICLE (1000-1500 word blog post)
Structure:
  HEADLINE: a sharp claim (one line)
  INTRO: 2-3 paragraphs framing the operator pain
  3-4 SECTION SUBHEADERS: each with 150-250 words of substantive content
  CLOSING POV: one-paragraph anti-hype punchline
  CTA: link to marcoslacayobosche.com/diagnose
Tone: operator-respecting, anti-hype, anti-vendor. Specific over abstract.
Use markdown for the headline (#) and subheaders (##).`
};

function parseJson(text) {
    try { return JSON.parse(text); } catch {}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}
