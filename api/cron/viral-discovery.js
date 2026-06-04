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

// Use top.json?t=month so we get the most-upvoted posts of the LAST 30 DAYS,
// not just current "hot". That's what "viral" actually means for these subs.
const REDDIT_SUBS = [
    { name: 'r/Radiology',         url: 'https://www.reddit.com/r/Radiology/top.json?t=month&limit=25' },
    { name: 'r/healthIT',          url: 'https://www.reddit.com/r/healthIT/top.json?t=month&limit=25' },
    { name: 'r/medicine',          url: 'https://www.reddit.com/r/medicine/top.json?t=month&limit=25' },
    { name: 'r/MedicalDoctor',     url: 'https://www.reddit.com/r/MedicalDoctor/top.json?t=month&limit=25' },
    { name: 'r/healthtech',        url: 'https://www.reddit.com/r/healthtech/top.json?t=month&limit=25' }
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

const MIN_SCORE = 40;  // Claude alignment score floor — below this never enters the inbox
const MAX_QUERIES_PER_SOURCE = 6;  // Cap YT/HN/Google searches per cron run

// Engagement thresholds — tuned for "actually viral in healthcare AI" over a 30-day window.
// Now we're filtering for TRUE virality, not just "anything that exists."
const MIN_YT_VIEWS     = 5000;  // top tier of healthcare AI YT content over 7 days
const MIN_REDDIT_SCORE = 30;    // top-of-month posts in the healthcare subs
const MIN_HN_POINTS    = 30;    // top quartile of healthcare-tagged HN over 30 days

// How many top items to keep PER source after Claude scoring.
// Forces diversity — you always see a mix instead of just whichever source dominated.
const TOP_PER_SOURCE = 5;

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

        // 2. Gather candidates from all sources. Track errors per-source so we can
        //    surface them in the diagnostic response if something is failing.
        const errors_per_source = {};
        const trackError = (source, e) => {
            console.warn(`${source} failed:`, e.message);
            if (!errors_per_source[source]) errors_per_source[source] = [];
            errors_per_source[source].push(e.message.slice(0, 200));
        };
        const rssItems = await Promise.all(RSS_FEEDS.map(f => fetchRss(f.url, f.name).catch(e => {
            trackError('rss', e); return [];
        })));
        const redditItems = await Promise.all(REDDIT_SUBS.map(s => fetchReddit(s.url, s.name).catch(e => {
            trackError('reddit', e); return [];
        })));
        const ytItems = await Promise.all(queries.map(q => fetchYouTube(q).catch(e => {
            trackError('youtube', e); return [];
        })));
        const hnItems = await Promise.all(queries.map(q => fetchHackerNews(q).catch(e => {
            trackError('hackernews', e); return [];
        })));
        const googleItems = await Promise.all(queries.map(q => fetchGoogle(q).catch(e => {
            trackError('google', e); return [];
        })));

        const counts_per_source = {
            rss: rssItems.flat().length,
            reddit: redditItems.flat().length,
            youtube: ytItems.flat().length,
            hackernews: hnItems.flat().length,
            google: googleItems.flat().length
        };

        let candidates = [
            ...rssItems.flat(),
            ...redditItems.flat(),
            ...ytItems.flat(),
            ...hnItems.flat(),
            ...googleItems.flat()
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

        // 7. Insert top-N per source — ranked by VIRALITY (engagement signal)
        //    with Claude score as quality gate. Engagement is the primary
        //    ranking; alignment is the floor.
        //    For sources without engagement data (RSS, Google), fall back to
        //    Claude score as the ranking signal.
        const bySource = {};
        scored.forEach(item => {
            if ((item.claude_score || 0) < MIN_SCORE) return;
            const src = item.source || 'unknown';
            if (!bySource[src]) bySource[src] = [];
            bySource[src].push(item);
        });
        const toInsert = [];
        const kept_per_source = {};
        Object.entries(bySource).forEach(([src, items]) => {
            const hasEngagement = items.some(i => (i.engagement_signal || 0) > 0);
            items.sort((a, b) => {
                if (hasEngagement) {
                    // Primary: engagement DESC. Tiebreaker: claude_score DESC.
                    const eDiff = (b.engagement_signal || 0) - (a.engagement_signal || 0);
                    if (eDiff !== 0) return eDiff;
                }
                return (b.claude_score || 0) - (a.claude_score || 0);
            });
            const top = items.slice(0, TOP_PER_SOURCE);
            kept_per_source[src] = top.length;
            toInsert.push(...top);
        });

        const topScores = [...scored]
            .sort((a, b) => (b.claude_score || 0) - (a.claude_score || 0))
            .slice(0, 5)
            .map(s => ({ title: s.title, source: s.source, score: s.claude_score, why: s.claude_summary }));

        if (toInsert.length === 0) {
            return res.status(200).json({
                ok: true,
                inserted: 0,
                evaluated: candidates.length,
                counts_per_source,
                kept_per_source,
                focus_topics_used: queries,
                errors_per_source,
                thresholds: { min_score: MIN_SCORE, min_yt_views: MIN_YT_VIEWS, min_reddit_score: MIN_REDDIT_SCORE, min_hn_points: MIN_HN_POINTS, top_per_source: TOP_PER_SOURCE },
                top_scores: topScores,
                hint: 'No items met the score threshold. Check counts_per_source — if all are 0 the engagement filters may be too strict, or sources are returning nothing. Try broader Focus Topics or lower thresholds.'
            });
        }
        const inserted = await insertViralInputs(toInsert);

        return res.status(200).json({
            ok: true,
            evaluated: candidates.length,
            inserted: inserted.length,
            counts_per_source,
            kept_per_source,
            focus_topics_used: queries,
            thresholds: { min_score: MIN_SCORE, min_yt_views: MIN_YT_VIEWS, min_reddit_score: MIN_REDDIT_SCORE, min_hn_points: MIN_HN_POINTS, top_per_source: TOP_PER_SOURCE },
            top_scores: topScores,
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
    // Use on_conflict=url so duplicate URLs are silently ignored instead of
    // failing the whole batch. Prefer: resolution=ignore-duplicates makes the
    // returned representation reflect only the rows that ACTUALLY persisted.
    const r = await fetch(`${SUPABASE_URL}/rest/v1/viral_inputs?on_conflict=url`, {
        method: 'POST',
        headers: {
            ...supabaseHeaders(),
            'Prefer': 'return=representation,resolution=ignore-duplicates'
        },
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
    const since = Date.now() - 48 * 3600 * 1000;  // last 48 hrs (some feeds publish in bursts)

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
    if (!r.ok) {
        throw new Error(`Reddit ${r.status} for ${sourceName}: ${(await r.text()).slice(0, 120)}`);
    }
    const data = await r.json();
    // 30-day window matching the top.json?t=month URL
    const since = Date.now() - 30 * 86400 * 1000;
    return (data.data?.children || [])
        .map(c => c.data)
        .filter(d => d.created_utc * 1000 >= since)
        .filter(d => !d.over_18)
        .filter(d => (d.score || 0) >= MIN_REDDIT_SCORE)
        .map(d => ({
            source: 'reddit',
            source_name: sourceName,
            url: `https://reddit.com${d.permalink}`,
            title: d.title,
            excerpt: (d.selftext || '').slice(0, 500),
            published_at: new Date(d.created_utc * 1000).toISOString(),
            engagement_signal: d.score || 0,
            // The sub itself is already healthcare-targeted (r/Radiology, r/healthIT,
            // r/medicine) — no need for the broad keyword filter to drop posts that
            // don't say "fax/HL7/EHR" explicitly.
            from_focus_query: true
        }));
}

// ============================================================================
// YouTube Data API v3 — official, free quota (10k units/day)
// ============================================================================
async function fetchYouTube(query) {
    const key = process.env.YOUTUBE_API_KEY;
    if (!key) return [];

    const since = new Date(Date.now() - 7 * 86400 * 1000).toISOString();
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?key=${key}&q=${encodeURIComponent(query)}&part=snippet&type=video&order=viewCount&publishedAfter=${since}&maxResults=15&relevanceLanguage=en`;
    const r = await fetch(searchUrl);
    if (!r.ok) {
        throw new Error(`YT ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }
    const data = await r.json();
    const items = data.items || [];
    if (items.length === 0) return [];

    // The search endpoint doesn't return viewCount — we need a second call.
    const ids = items.map(it => it.id?.videoId).filter(Boolean);
    let viewMap = new Map();
    try {
        const statsUrl = `https://www.googleapis.com/youtube/v3/videos?key=${key}&part=statistics&id=${ids.join(',')}`;
        const sr = await fetch(statsUrl);
        if (sr.ok) {
            const sdata = await sr.json();
            (sdata.items || []).forEach(v => {
                viewMap.set(v.id, parseInt(v.statistics?.viewCount || '0', 10));
            });
        }
    } catch (e) {
        // Non-fatal — fall through with no view filtering
        console.warn(`YT stats fetch failed for "${query}":`, e.message);
    }

    return items
        .map(it => {
            const views = viewMap.get(it.id?.videoId) || 0;
            return { it, views };
        })
        .filter(({ views }) => views >= MIN_YT_VIEWS)
        .map(({ it, views }) => ({
            source: 'youtube',
            source_name: `YouTube: ${it.snippet?.channelTitle || 'unknown'}`,
            url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
            title: it.snippet?.title || '',
            excerpt: (it.snippet?.description || '').slice(0, 500),
            published_at: it.snippet?.publishedAt || new Date().toISOString(),
            engagement_signal: views,
            from_focus_query: true
        }));
}

// ============================================================================
// Hacker News (Algolia search API — free, no key)
// ============================================================================
async function fetchHackerNews(query) {
    // 30-day window — HN healthcare stories are rare; need a wider net for virality
    const since = Math.floor((Date.now() - 30 * 86400 * 1000) / 1000);
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&numericFilters=created_at_i>${since}`;
    const r = await fetch(url);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.hits || [])
        .filter(h => (h.points || 0) >= MIN_HN_POINTS)
        .slice(0, 6)
        .map(h => ({
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
// Google Custom Search JSON API (free 100/day, requires GOOGLE_API_KEY + GOOGLE_CSE_ID)
// ============================================================================
async function fetchGoogle(query) {
    const key = process.env.GOOGLE_API_KEY;
    const cseId = process.env.GOOGLE_CSE_ID;
    if (!key || !cseId) {
        // Silently skip if not configured
        return [];
    }
    // 30-day window matching the rest of the cron — gives Google a wider pool
    const url = `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cseId}&q=${encodeURIComponent(query)}&dateRestrict=m1&num=10`;
    const r = await fetch(url);
    if (!r.ok) {
        const errBody = await r.text();
        throw new Error(`Google CSE ${r.status}: ${errBody.slice(0, 200)}`);
    }
    const data = await r.json();
    return (data.items || []).map(it => ({
        source: 'google',
        source_name: `Google: ${it.displayLink || 'web'}`,
        url: it.link,
        title: it.title || '',
        excerpt: (it.snippet || '').slice(0, 500),
        // CSE doesn't reliably return pubdate; we use cron time and rely on
        // dateRestrict=d1 to ensure results are from the last 24h.
        published_at: new Date().toISOString(),
        engagement_signal: null,
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
        // Strip from_focus_query — it's a runtime flag, not a viral_inputs column
        const { from_focus_query, ...rest } = c;
        return {
            ...rest,
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
