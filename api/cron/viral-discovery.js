// ==========================================================================
// /api/cron/viral-discovery — daily, 8am ET (13 UTC)
// Pulls last 24hrs of healthcare content from RSS + Reddit, scores each
// against VytalMed POV pillars via Claude, and inserts high-alignment
// items into viral_inputs for Marcos's CRM Inbox to review.
// ==========================================================================

import { callClaude } from '../../lib/anthropic.js';

const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVjY29kb2hoZWVrd2J5d2lmaXBsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1NTU3NTIsImV4cCI6MjA4NTEzMTc1Mn0.pU41NU8tPvcf9Js8UTFppcS983-zyxGocLj2OVONNwo';

const RSS_FEEDS = [
    { url: 'https://www.fiercehealthcare.com/rss/xml', name: 'Fierce Healthcare' },
    { url: 'https://www.kevinmd.com/feed/', name: 'KevinMD' },
    { url: 'https://hitconsultant.net/feed/', name: 'HIT Consultant' }
];

const REDDIT_SUBS = [
    { name: 'r/Radiology', url: 'https://www.reddit.com/r/Radiology/hot.json?limit=15' },
    { name: 'r/healthIT',  url: 'https://www.reddit.com/r/healthIT/hot.json?limit=15' },
    { name: 'r/medicine',  url: 'https://www.reddit.com/r/medicine/hot.json?limit=15' }
];

// Fallback queries used when no focus_topics are configured.
const DEFAULT_QUERIES = [
    'healthcare AI workflow',
    'EHR automation',
    'radiology AI',
    'prior authorization automation'
];

const KEYWORDS = [
    'ai', 'workflow', 'automation', 'fax', 'ehr', 'emr', 'pacs', 'ris',
    'hl7', 'fhir', 'epic', 'cerner', 'meditech', 'vendor', 'prior auth',
    'staffing', 'burnout', 'denial', 'rcm', 'integration', 'interoperability',
    'data entry', 'efficiency', 'productivity', 'reporting'
];

const MIN_SCORE = 55;  // Anything below this gets filtered out
const MAX_QUERIES_PER_SOURCE = 6;  // Cap YT/HN searches per cron run

export default async function handler(req, res) {
    // Vercel cron sends Authorization: Bearer <CRON_SECRET> if set; allow open for now
    const startedAt = Date.now();
    try {
        // 1. Pull POV pillars + focus topics
        const pillars = await fetchPillars();
        if (pillars.length === 0) {
            return res.status(500).json({ error: 'No POV pillars in DB — run viral_pipeline_migration.sql first' });
        }
        const focusTopics = await fetchFocusTopics();
        const queries = (focusTopics.length > 0 ? focusTopics : DEFAULT_QUERIES).slice(0, MAX_QUERIES_PER_SOURCE);

        // 2. Gather candidates from all sources
        const rssItems = await Promise.all(RSS_FEEDS.map(f => fetchRss(f.url, f.name).catch(e => {
            console.warn(`RSS ${f.name} failed:`, e.message); return [];
        })));
        const redditItems = await Promise.all(REDDIT_SUBS.map(s => fetchReddit(s.url, s.name).catch(e => {
            console.warn(`Reddit ${s.name} failed:`, e.message); return [];
        })));
        const ytItems = await Promise.all(queries.map(q => fetchYouTube(q).catch(e => {
            console.warn(`YouTube "${q}" failed:`, e.message); return [];
        })));
        const hnItems = await Promise.all(queries.map(q => fetchHackerNews(q).catch(e => {
            console.warn(`HN "${q}" failed:`, e.message); return [];
        })));

        let candidates = [
            ...rssItems.flat(),
            ...redditItems.flat(),
            ...ytItems.flat(),
            ...hnItems.flat()
        ];

        // 3. Pre-filter by keywords (cheap). Skip keyword filter for items
        //    that came from a focus-topic query (already pre-targeted).
        candidates = candidates.filter(c => c.from_focus_query || matchesKeywords(c));

        // 4. Dedupe by URL against last 7 days
        const recent = await fetchRecentUrls();
        candidates = candidates.filter(c => !recent.has(c.url));

        // 4b. Dedupe within this run (same URL coming from multiple sources)
        const seen = new Set();
        candidates = candidates.filter(c => {
            if (seen.has(c.url)) return false;
            seen.add(c.url);
            return true;
        });

        if (candidates.length === 0) {
            return res.status(200).json({ ok: true, inserted: 0, message: 'No new keyword matches' });
        }

        // 5. Cap at 30 to keep Claude cost predictable
        candidates = candidates.slice(0, 30);

        // 6. Score with Claude (one batch call), with focus topics as a boost signal
        const scored = await scoreBatch(candidates, pillars, focusTopics);

        // 7. Insert items above threshold
        const toInsert = scored.filter(s => s.claude_score >= MIN_SCORE);
        if (toInsert.length === 0) {
            return res.status(200).json({ ok: true, inserted: 0, evaluated: candidates.length });
        }
        const inserted = await insertViralInputs(toInsert);

        return res.status(200).json({
            ok: true,
            evaluated: candidates.length,
            inserted: inserted.length,
            elapsed_ms: Date.now() - startedAt
        });
    } catch (e) {
        console.error('viral-discovery error:', e);
        return res.status(500).json({ error: e.message || 'discovery failed' });
    }
}

// ============================================================================
// Pillar lookup
// ============================================================================
async function fetchPillars() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pov_pillars?is_active=eq.true&select=slug,statement&order=order_index`, {
        headers: supabaseHeaders()
    });
    if (!r.ok) return [];
    return await r.json();
}

async function fetchFocusTopics() {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/discovery_config?id=eq.1&select=focus_topics`, {
        headers: supabaseHeaders()
    });
    if (!r.ok) return [];
    const rows = await r.json();
    return rows[0]?.focus_topics || [];
}

async function fetchRecentUrls() {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const r = await fetch(
        `${SUPABASE_URL}/rest/v1/viral_inputs?created_at=gte.${sevenDaysAgo}&select=url`,
        { headers: supabaseHeaders() }
    );
    if (!r.ok) return new Set();
    const rows = await r.json();
    return new Set(rows.map(r => r.url));
}

async function insertViralInputs(items) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/viral_inputs`, {
        method: 'POST',
        headers: { ...supabaseHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(items)
    });
    if (!r.ok) {
        console.error('viral_inputs insert failed:', await r.text());
        return [];
    }
    return await r.json();
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
// RSS parser (regex-based — enough for major feeds)
// ============================================================================
async function fetchRss(url, sourceName) {
    const r = await fetch(url, { headers: { 'User-Agent': 'VytalMed-Discovery/1.0' } });
    if (!r.ok) return [];
    const xml = await r.text();
    const since = Date.now() - 86400 * 1000;  // last 24 hrs

    const items = [];
    const itemRegex = /<item[\s\S]*?<\/item>/g;
    const matches = xml.match(itemRegex) || [];
    for (const block of matches) {
        const title = stripXml(extract(block, 'title'));
        const link  = stripXml(extract(block, 'link'));
        const desc  = stripXml(extract(block, 'description'));
        const pub   = extract(block, 'pubDate');
        if (!title || !link) continue;
        const publishedAt = pub ? new Date(pub) : null;
        if (publishedAt && publishedAt.getTime() < since) continue;
        items.push({
            source: 'rss',
            source_name: sourceName,
            url: link,
            title,
            excerpt: desc.slice(0, 500),
            published_at: publishedAt ? publishedAt.toISOString() : new Date().toISOString(),
            engagement_signal: null
        });
    }
    return items;
}

function extract(block, tag) {
    const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
    return m ? m[1].trim() : '';
}

function stripXml(s) {
    return s
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
        .trim();
}

// ============================================================================
// Reddit fetcher
// ============================================================================
async function fetchReddit(url, sourceName) {
    const r = await fetch(url, { headers: { 'User-Agent': 'VytalMed-Discovery/1.0' } });
    if (!r.ok) return [];
    const data = await r.json();
    const since = Date.now() - 86400 * 1000;
    return (data.data?.children || [])
        .map(c => c.data)
        .filter(d => d.created_utc * 1000 >= since)
        .filter(d => !d.over_18)
        .map(d => ({
            source: 'reddit',
            source_name: sourceName,
            url: `https://reddit.com${d.permalink}`,
            title: d.title,
            excerpt: (d.selftext || '').slice(0, 500),
            published_at: new Date(d.created_utc * 1000).toISOString(),
            engagement_signal: d.score || 0
        }));
}

// ============================================================================
// YouTube Data API v3 — official, free quota (10k units/day)
// ============================================================================
async function fetchYouTube(query) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
        // Silently skip if no key set
        return [];
    }
    const since = new Date(Date.now() - 86400 * 1000).toISOString();
    const url = `https://www.googleapis.com/youtube/v3/search?key=${key}&q=${encodeURIComponent(query)}&part=snippet&type=video&order=relevance&publishedAfter=${since}&maxResults=8`;
    const r = await fetch(url);
    if (!r.ok) {
        const errBody = await r.text();
        throw new Error(`YT ${r.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await r.json();
    return (data.items || []).map(it => ({
        source: 'youtube',
        source_name: `YouTube: ${it.snippet?.channelTitle || 'unknown'}`,
        url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
        title: it.snippet?.title || '',
        excerpt: (it.snippet?.description || '').slice(0, 500),
        published_at: it.snippet?.publishedAt || new Date().toISOString(),
        engagement_signal: null,
        from_focus_query: true  // pre-targeted; skip keyword filter
    }));
}

// ============================================================================
// Hacker News (Algolia search API — free, no key)
// ============================================================================
async function fetchHackerNews(query) {
    const since = Math.floor((Date.now() - 86400 * 1000) / 1000);
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.hits || []).slice(0, 6).map(h => ({
        source: 'hackernews',
        source_name: 'Hacker News',
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.title || '',
        excerpt: (h.story_text || h._highlightResult?.story_text?.value || '').replace(/<[^>]+>/g, '').slice(0, 500),
        published_at: new Date((h.created_at_i || 0) * 1000).toISOString(),
        engagement_signal: h.points || 0,
        from_focus_query: true
    }));
}

// ============================================================================
// Keyword pre-filter (cheap)
// ============================================================================
function matchesKeywords(item) {
    const hay = `${item.title || ''} ${item.excerpt || ''}`.toLowerCase();
    return KEYWORDS.some(k => hay.includes(k));
}

// ============================================================================
// Claude batch scorer
// ============================================================================
async function scoreBatch(candidates, pillars, focusTopics = []) {
    const pillarList = pillars.map((p, i) => `${i + 1}. [${p.slug}] ${p.statement}`).join('\n');

    const itemList = candidates.map((c, i) => `
ITEM ${i}:
SOURCE: ${c.source_name}
TITLE: ${c.title}
EXCERPT: ${c.excerpt.slice(0, 240)}
URL: ${c.url}
`).join('\n');

    const focusBlock = focusTopics.length > 0
        ? `\nPRIORITY TOPICS (boost score meaningfully — these are what Marcos is focused on right now):\n${focusTopics.map(t => `  - ${t}`).join('\n')}\nAn item that directly matches one of these topics should score 80+. Items irrelevant to these AND irrelevant to pillars should score low.\n`
        : '';

    const systemPrompt = `You are the VytalMed Content Scout. VytalMed is a healthcare-specialized software development agency. We post to LinkedIn to attract healthcare operators (CIOs, COOs, radiology group leaders, PE-backed multi-site practice operators).

Your job: score each candidate item 0-100 on how well it could fuel a LinkedIn post that lands one of our POV pillars.

POV PILLARS:
${pillarList}
${focusBlock}
A high score (75-100) means:
- The item touches a real operator pain (vendor lock-in, AI hype, integration mess, staffing crunch, prior auth, denials, etc.)
- We could write a post that quotes/references the item and lands a VytalMed POV
- Tone fits operator-respecting, anti-hype, anti-vendor

A medium score (55-74) means: relevant healthcare topic but not directly aligned to a pillar — could still draft a post.

Below 55: skip. Mark as low.

RETURN JSON ARRAY ONLY (no markdown). One object per item, in the SAME ORDER as input:
[
  { "index": 0, "score": 0-100 integer, "best_pillar_slug": "deck-X", "one_line_why": "<one sentence on why this works (or doesn't)>" },
  ...
]`;

    const { text } = await callClaude({
        model: 'claude-opus-4-7',
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Score these ${candidates.length} candidates:\n\n${itemList}` }]
    });

    const scores = parseJsonArray(text);
    if (!scores) {
        console.error('Could not parse Claude score output');
        return [];
    }

    return scores.map(s => {
        const c = candidates[s.index];
        if (!c) return null;
        return {
            ...c,
            claude_score: s.score,
            claude_alignment_pillar: s.best_pillar_slug,
            claude_summary: s.one_line_why,
            status: 'new'
        };
    }).filter(Boolean);
}

function parseJsonArray(text) {
    try { return JSON.parse(text); } catch {}
    const m = text.match(/\[[\s\S]*\]/);
    if (m) { try { return JSON.parse(m[0]); } catch {} }
    return null;
}
