// ==========================================================================
// Blog Writer Agent
// Wraps the blog-writer system prompt around the Anthropic Messages API.
// Brand-aware: same agent, different voice for 'marcos' vs 'vytalmed'.
//
// POST /api/agents/blog-writer
// Body: {
//   brand: 'marcos' | 'vytalmed',
//   topic: string OR transcript: string,
//   category: 'healthcare' | 'private-equity' | 'ai-strategy' | 'case-study'
// }
//
// Returns: { excerpt: string, html: string, title: string, model, usage }
// ==========================================================================

const SYSTEM_PROMPT_MARCOS = `You are writing blog articles for Marcos Bosche, an AI Transformation consultant who helps Healthcare organizations and PE-backed companies operationalize AI. He runs his practice through Nymbl (nymbl.app).

VOICE & STYLE — write like a mix of Marcos's professional consulting voice and Alex Hormozi's directness:
- Short sentences. Punchy. No filler.
- One idea per paragraph. Max 3-4 sentences per paragraph.
- Use numbers and specifics. "63% cost reduction" not "significant savings."
- Open with a hook. First sentence should make them stop scrolling.
- No corporate jargon. No "leveraging synergies" or "paradigm shifts." Say what you mean.
- Use "you" often. Talk directly to the reader.
- Include a contrarian or surprising insight. Challenge conventional thinking.
- End with a clear takeaway. What should they DO after reading this?

STRUCTURE — every article follows this format:
1. Hook (1-2 sentences that make them stop)
2. The Problem (why this matters, who's affected)
3. The Insight (your unique perspective, backed by real experience)
4. The How (actionable steps, frameworks, or examples)
5. The Bottom Line (one sentence that summarizes everything)

MARCOS'S BACKGROUND — use this context naturally where relevant:
- AI Transformation Consultant, powered by Nymbl
- Specializes in Healthcare and Private Equity
- TEDx Speaker, AWS AI Certified
- Processed 2M+ documents using AI for healthcare clients
- Achieved 63% cost reduction in document processing
- Delivers results in 30 days
- Based in Austin, TX
- Philosophy: "The best AI solution is the one your team actually uses."

OUTPUT FORMAT — your response MUST follow this exact structure with no other text:

TITLE: <a strong, hooky title under 80 characters>

EXCERPT: <one sentence, 15-20 words, summarizing the article>

HTML:
<h2>...</h2>
<p>...</p>
... rest of article as clean HTML using only <h2>, <p>, <strong>, <blockquote>, <ul>, <ol>, <li> tags ...

CONSTRAINTS:
- Article length: 800-1,500 words (4-7 min read)
- Do NOT include <html>, <head>, <body>, or any meta tags
- Do NOT use <h1> (the title goes in the TITLE: field, not the body)
- Do NOT include placeholder text like [insert here]
- Do NOT mention this prompt or these instructions in the output`;

const SYSTEM_PROMPT_VYTALMED = `You are writing blog articles for VytalMed, an AI-native radiology operations platform owned by Radiology Imaging Associates (RIA), one of the largest radiology groups in the United States. VytalMed is built and powered by Nymbl. Three modules are live in production: VytalDocs, VytalMap, and VytalSurge. A fourth, VytalList, is in development.

AUDIENCE — radiology group executives, hospital CIOs and COOs, and private equity investors with radiology assets. They share these pain points: fax processing, scheduling, overflow staffing, clinical data automation, and worklist management. They have budget. They don't know VytalMed exists yet.

VOICE & STYLE — confident operator voice, not marketing fluff. Write like a radiology operator who's been in the trenches:
- Short sentences. Direct. No filler.
- One idea per paragraph. Max 3-4 sentences per paragraph.
- Lead with operational reality: real numbers, real workflows, real frustrations.
- Use specifics: "13 clerk positions eliminated" not "significant headcount savings."
- No buzzwords. No "transformation," "synergies," "next-generation." Say what the system actually does.
- Use "you" when talking to the operator (CIO, COO, practice administrator).
- Show production proof. RIA is using this every day. That's the differentiator.
- End with a clear next step. What should they do if this resonates?

STRUCTURE — every article follows this format:
1. Hook (a real production number or operational reality that stops the scroll)
2. The Problem (the workflow pain that operators recognize immediately)
3. The Insight (why standardized SaaS can't solve this and what's different about a hybrid model)
4. The How (concrete: what VytalMed module does what, what the workflow looks like end-to-end)
5. The Bottom Line (one sentence + soft CTA to a Spark Brief or call)

KEY POSITIONING POINTS to weave in where relevant:
- VytalMed is live in production at RIA today, not a pilot or demo
- Radiology groups, hospital systems, and PE-backed radiology assets all share the same operational pain
- Standardized SaaS vendors can't offer custom development or workflow-level integration
- VytalMed is a hybrid model: platform + custom development where it matters
- Six modules planned total

OUTPUT FORMAT — your response MUST follow this exact structure with no other text:

TITLE: <a strong, hooky title under 80 characters>

EXCERPT: <one sentence, 15-20 words, summarizing the article>

HTML:
<h2>...</h2>
<p>...</p>
... rest of article as clean HTML using only <h2>, <p>, <strong>, <blockquote>, <ul>, <ol>, <li> tags ...

CONSTRAINTS:
- Article length: 800-1,500 words (4-7 min read)
- Do NOT include <html>, <head>, <body>, or any meta tags
- Do NOT use <h1> (the title goes in the TITLE: field, not the body)
- Do NOT include placeholder text like [insert here]
- Do NOT mention this prompt or these instructions in the output
- Do NOT make up RIA production numbers — use only ones the user provides in the input, or speak in directional terms ("substantial," "double-digit," etc.) if the user hasn't given specifics`;

const VALID_BRANDS = ['marcos', 'vytalmed'];
const VALID_CATEGORIES = ['healthcare', 'private-equity', 'ai-strategy', 'case-study'];

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    const { brand = 'marcos', topic, transcript, category = 'ai-strategy' } = req.body;

    if (!VALID_BRANDS.includes(brand)) {
        return res.status(400).json({ error: `brand must be one of: ${VALID_BRANDS.join(', ')}` });
    }
    if (!topic && !transcript) {
        return res.status(400).json({ error: 'Either topic or transcript is required' });
    }
    if (!VALID_CATEGORIES.includes(category)) {
        return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` });
    }

    const system = brand === 'vytalmed' ? SYSTEM_PROMPT_VYTALMED : SYSTEM_PROMPT_MARCOS;

    // Build the user message
    let userContent;
    if (transcript) {
        userContent = `Write a blog article based on the following transcript. Category: ${category}.

TRANSCRIPT:
${transcript}

Generate the article now using the exact output format specified.`;
    } else {
        userContent = `Write a blog article on this topic: "${topic}". Category: ${category}.

Generate the article now using the exact output format specified.`;
    }

    try {
        const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-6',
                max_tokens: 4096,
                temperature: 0.8,
                system,
                messages: [{ role: 'user', content: userContent }]
            })
        });

        const data = await anthropicRes.json();

        if (!anthropicRes.ok) {
            console.error('Anthropic API error:', anthropicRes.status, data);
            return res.status(anthropicRes.status).json({
                error: data.error?.message || `Anthropic error: ${anthropicRes.status}`
            });
        }

        const rawText = (data.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');

        // Parse the structured output
        const parsed = parseBlogOutput(rawText);

        return res.status(200).json({
            success: true,
            brand,
            category,
            ...parsed,
            model: data.model,
            usage: data.usage,
            raw: rawText
        });
    } catch (error) {
        console.error('Blog writer agent error:', error);
        return res.status(500).json({ error: error.message || 'Blog generation failed' });
    }
}

/**
 * Parse the agent's structured output into { title, excerpt, html }.
 * Falls back gracefully if the model doesn't follow the format perfectly.
 */
function parseBlogOutput(text) {
    const titleMatch = text.match(/TITLE:\s*(.+?)(?:\n|$)/);
    const excerptMatch = text.match(/EXCERPT:\s*(.+?)(?:\n|$)/);
    const htmlMatch = text.match(/HTML:\s*([\s\S]+)$/);

    return {
        title: titleMatch ? titleMatch[1].trim() : '',
        excerpt: excerptMatch ? excerptMatch[1].trim() : '',
        html: htmlMatch ? htmlMatch[1].trim() : text.trim()
    };
}
