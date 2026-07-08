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
                source = isYouTubeUrl(trimmed)
                    ? await fetchYouTubeContent(trimmed)
                    : await fetchUrlContent(trimmed);
            } catch (e) {
                // Paywalls (WSJ, NYT) + auth walls (LinkedIn, X) often block server-side fetch.
                // Extract names + topic hints from the URL slug as a fallback so Claude can
                // still reference the actual subject of the article by name.
                const slugInfo = extractSlugHints(trimmed);
                source = {
                    title: slugInfo.likelyTitle || trimmed.slice(0, 100),
                    content: `URL: ${trimmed}\n\nThe page could not be fetched (likely paywall or auth wall). However the URL itself contains useful clues:\n\nApparent subject from URL slug: ${slugInfo.subject}\nLikely named entities: ${slugInfo.entities.join(', ') || '(none parsed)'}\n\nUse these entities by name in your content. Treat them as the actual subjects of the article. If a slug term looks like a company name (capitalized in URL, or sits next to "with"/"partners"/"acquires"/"raises"), name it explicitly.`,
                    url: trimmed
                };
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

// YouTube pages are JS-rendered, so the raw HTML fetch returns almost nothing.
// oEmbed gives us title + channel name without an API key. Combined with any
// og:description we can still scrape from the raw HTML, Claude has enough
// to write real content instead of a post about "the empty page it got".
function isYouTubeUrl(url) {
    try {
        const h = new URL(url).hostname.toLowerCase();
        return h === 'youtu.be' || h === 'youtube.com' || h.endsWith('.youtube.com');
    } catch { return false; }
}

async function fetchYouTubeContent(url) {
    let title = '';
    let author = '';
    let ogDesc = '';

    // 1. oEmbed — reliable title + author, no API key
    try {
        const oembedResp = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VytalMedCapture/1.0)' }
        });
        if (oembedResp.ok) {
            const data = await oembedResp.json();
            title = (data.title || '').trim();
            author = (data.author_name || '').trim();
        }
    } catch (_) { /* fall through */ }

    // 2. Raw page fetch for og:description (works even though the body is JS-rendered)
    try {
        const r = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; VytalMedCapture/1.0; +https://vytalmed.co)',
                'Accept': 'text/html,application/xhtml+xml'
            },
            redirect: 'follow'
        });
        if (r.ok) {
            const html = await r.text();
            const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
            if (ogDescMatch) ogDesc = decodeEntities(ogDescMatch[1]).trim();
            if (!title) {
                const ogTitleMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
                if (ogTitleMatch) title = decodeEntities(ogTitleMatch[1]).trim();
            }
        }
    } catch (_) { /* fall through */ }

    if (!title && !ogDesc) {
        throw new Error('YouTube page returned no title/description');
    }

    const content = [
        `YouTube video: ${title || '(no title)'}`,
        author ? `Channel: ${author}` : '',
        ogDesc ? `\nDescription:\n${ogDesc}` : '',
        `\nSource URL: ${url}`,
        `\nNote: this is a YouTube video. Treat the title + description above as the subject. Teach what the video is about. Do not write a post about "the source was empty" — you have the title, use it.`
    ].filter(Boolean).join('\n');

    return { title: title || 'YouTube video', content, url };
}

function decodeEntities(s) {
    return String(s || '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'");
}

// Pull names + topic from URL when the page itself is unreachable.
// E.g. "nvidia-is-developing-an-ai-healthcare-model-with-startup-abridge-6db38c1b"
//      → subject: "nvidia is developing an ai healthcare model with startup abridge"
//      → entities: ["Nvidia", "Abridge"]
function extractSlugHints(url) {
    try {
        const u = new URL(url);
        const segments = u.pathname.split('/').filter(Boolean);
        // Use the longest path segment — usually the article slug
        const slug = segments.sort((a, b) => b.length - a.length)[0] || '';
        // Strip trailing hash ids (e.g. "-6db38c1b") that aren't real words
        const cleaned = slug.replace(/-[a-f0-9]{6,}$/i, '').replace(/[-_]/g, ' ').replace(/\.[a-z]+$/, '').trim();

        // Common connector words that suggest a named entity is adjacent
        const connectors = ['with', 'and', 'partners', 'acquires', 'buys', 'raises', 'launches', 'sues', 'vs', 'startup', 'company', 'announces'];
        const stopwords = new Set(['the','a','an','is','are','was','were','to','of','for','from','in','on','at','by','as','it','its','that','this','these','those','will','can','has','have','had','be','been','being','their','his','her','our','your','my','what','who','why','how','when','where','about','into','out','up','down','over','under','through','during','before','after','above','below']);

        const words = cleaned.split(/\s+/);
        const entities = new Set();

        words.forEach((w, i) => {
            if (!w || w.length < 3 || stopwords.has(w.toLowerCase())) return;
            // Words near a connector are likely entities
            const prev = (words[i - 1] || '').toLowerCase();
            const next = (words[i + 1] || '').toLowerCase();
            if (connectors.includes(prev) || connectors.includes(next)) {
                entities.add(w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
            }
        });

        // Also: first noun-ish word is often the main subject
        if (words[0] && words[0].length >= 3 && !stopwords.has(words[0].toLowerCase())) {
            entities.add(words[0].charAt(0).toUpperCase() + words[0].slice(1).toLowerCase());
        }

        return {
            subject: cleaned || u.hostname,
            entities: [...entities],
            likelyTitle: cleaned.replace(/\b\w/g, c => c.toUpperCase())
        };
    } catch {
        return { subject: url, entities: [], likelyTitle: '' };
    }
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

    const systemPrompt = `You write content in the Alex Hormozi mold. Your job is to TEACH, not sell. Every post must give the reader something they can USE even if they never hire VytalMed.

Marcos Bosche is the face. He runs VytalMed — a healthcare-specialized software development agency — but he writes like an operator sharing hard-won lessons, not like a vendor pitching. Anti-fluff. Framework-driven. Specific.

WORLD VIEW (anchor to these — never quote them verbatim, but echo the thinking):
- Most dev shops don't understand healthcare. Specialization compounds.
- SaaS solves 60% of any healthcare workflow. The other 40% is where everything breaks.
- AI alone doesn't fix a broken workflow. AI + the right workflow does.
- Every system speaks a different language (HL7, FHIR, DICOM, fax, custom CSV).
- Staff burn hours on work that should be automated.
- Generalists pay tuition every healthcare project.

CONTENT RULE — CRITICAL:
The content is about the SOURCE the user gave you. Stay on that topic.
- Name the source's people, companies, and products by name when relevant.
- Add VytalMed POV (anti-vendor, operator-first) to how you TEACH the topic.
- Do NOT redirect the content to be about VytalMed or its modules.
- VytalMed only appears in the closing CTA — never as the subject of the post.

HORMOZI-STYLE VOICE RULES (apply to every format):
- Short sentences. Hard hits. Sentence fragments for emphasis. Like this.
- Frameworks and numbered lists: "3 mistakes", "5 questions", "2 ways". Numbered.
- Specific numbers and outcomes — never vague claims. ("20,000 faxes/day", "5-week", "80% in 80 days")
- Contrast pattern: "Most radiology groups do X. Smart operators do Y."
- Personal lessons: "I've seen this 100 times" / "Here's what works".
- Name real workflows (faxes, HL7, prior auth, denials, intake) over abstractions.
- NEVER use: "revolutionary", "game-changer", "unlock", "transformative", "leverage", "synergy".
- No emojis (sparingly, only when natural to the platform).
- TEACH first. The reader should learn something about the SOURCE whether or not they ever hire VytalMed.

CTA STYLE — soft offer, not sales pitch:
DON'T write: "Hire us", "Book a demo", "Get a quote", "Schedule a call"
DO write things like:
- "Want to see where your workflow scores? Run the 60-second diagnostic → marcoslacayobosche.com/diagnose"
- "More healthcare ops teardowns → marcoslacayobosche.com/diagnose"
- "Score your own workflow → marcoslacayobosche.com/diagnose"
The CTA must feel like the NEXT dose of value, not a sales close.

You'll receive ONE source. Don't quote it. Use it as the entry point to teach.

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
    'carousel': `📊 CAROUSEL (6-slide LinkedIn carousel — TEACHES about the SOURCE topic)

═══ CRITICAL — KEEP THESE TWO THINGS SEPARATE ═══

1. CONTENT (slides 1-6): must be ABOUT THE SOURCE TOPIC.
   - Name the source people/companies/products by name when relevant
   - Teach what the source is actually about + add operator POV
   - DO NOT hijack the content to be about VytalMed or its modules
   - The reader learns about the source — not VytalMed's product line

2. THEME (just a visual color hint — doesn't change content):
   Pick which VytalMed module's COLOR most loosely matches the source's
   domain. This only affects visual design, not what the carousel says.

═══════════════════════════════════════════════════

FIRST LINE — visual theme only:
  THEME: vytaldocs     (orange — source about: documents, intake, OCR, paperwork)
  THEME: vytalbridge   (purple — source about: integration, interop, EHR connection)
  THEME: vytalshift    (blue — source about: scheduling, capacity, workforce)
  THEME: vytalmap      (pink — source about: clinical data, AI scribes, dictation)
  THEME: vytalsurge    (green — source about: staffing, overflow, scale)
  THEME: vytalform     (teal — source about: forms, screening, registration)
If unsure, default: THEME: vytalbridge

Leave a blank line, then continue with the carousel slides.

Pick ONE teachable framework drawn from the SOURCE itself: "3 things [source] gets right", "Why [source] matters", "5 questions [source] raises", etc.

SLIDE 1 (HOOK): a sharp claim or framework name about the SOURCE. Max 8 words. Curiosity-driven.
  ✓ "3 mistakes most radiology groups make"
  ✓ "Why your EHR ships 60% solved"
  ✓ "The 14-system problem"
  ✗ "VytalMed builds for healthcare"
  ✗ "Healthcare AI is the future"

SLIDE 2 (SETUP): what's at stake. The operator's pain in 1-2 specific sentences. Use real numbers when possible.

SLIDE 3-5 (BODY): teach 3 things — 3 mistakes, 3 fixes, 3 questions, or 3 patterns. Each slide:
  - Numbered header (Mistake #1: ... OR Step 1: ... OR Q1: ...)
  - 1-2 supporting lines that actually TEACH something specific

SLIDE 6 (CTA): one lesson sentence + ONE soft offer. Example:
  "Most groups don't know which one costs them the most.
   Run the 60-second diagnostic → marcoslacayobosche.com/diagnose"

Format: plain text. Each slide labeled "SLIDE N:". Blank line between slides.`,

    'video-script': `🎬 VIDEO-SCRIPT (60-90 sec talking-head, runs through Submagic)

TEACH a specific lesson or framework. Don't pitch.

Structure:
  HOOK (5s): contrarian claim, framework name, or curiosity gap. No setup.
  TEACH (40s): the framework — 3 things, contrast pattern, or step-by-step. Numbered.
  EXAMPLE (20s): one specific story from the field. Real numbers.
  SOFT CTA (10s): "Want to see where your workflow scores? Run the diagnostic at marcoslacayobosche.com/diagnose"

Include [pause], [emphasis], [b-roll: description] cues throughout.
Sentence fragments encouraged for impact. Like this.`,

    'linkedin': `💼 LINKEDIN (300-500 word text post — TEACHES)

Structure:
  HOOK (one line, blank line after): sentence fragment or contrarian claim
  TEACH (2-3 short paragraphs): the framework, list, or contrast pattern. Use numbered or bulleted lists. Each item teachable.
  PERSONAL (1 short paragraph): "I've seen this 100 times" or "Here's what works" — first-person operator voice
  SOFT CTA (last line, separate, blank line above):
    "Score your own workflow in 60 seconds → marcoslacayobosche.com/diagnose"
    OR "More healthcare ops teardowns → marcoslacayobosche.com/diagnose"

Plain text only — LinkedIn doesn't render markdown. Short sentences. Line breaks between thoughts. No jargon padding. The reader must learn ONE specific thing they can use today.`,

    'article': `📝 ARTICLE (1000-1500 word blog post — TEACHES a framework)

Structure — PLAIN TEXT ONLY. No markdown symbols (no #, no ##, no **, no bold syntax).
The user will bold titles themselves when publishing.

  HEADLINE: strong lesson-driven title on its own line at the top. Plain text.
  INTRO (2-3 paragraphs): set up the operator pain with specifics; preview what they'll learn.
  3-4 NUMBERED SECTIONS: each starts with a line like "1. Section title", "2. Section title", "3. Section title" — on its own line, followed by a blank line, then ~150-250 words that teach + one short example.
  CLOSING: label it "The meta-lesson" on its own line, blank line, then one short paragraph pulling it together.
  CTA (last line, separate, blank line above):
    "Want to see where your workflow lands? Run the diagnostic → marcoslacayobosche.com/diagnose"

Tone: Hormozi explaining sales in long-form. Anti-fluff. Specific. The whole article must be useful even to someone who never clicks the CTA.`
};

function parseJson(text) {
    try { return JSON.parse(text); } catch {}
    const m = text.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}
