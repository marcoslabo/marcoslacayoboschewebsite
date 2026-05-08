// ==========================================================================
// LinkedIn Writer Agent — pure handler module
// ==========================================================================

import { callClaude } from '../anthropic.js';

const SYSTEM_PROMPT_MARCOS = `You write LinkedIn posts for Marcos Bosche, an AI Transformation consultant who helps Healthcare and PE-backed companies operationalize AI through Nymbl.

VOICE & STYLE — Alex Hormozi energy. Punchy, direct, slightly provocative.
- Hook in the first line. This is the most important line — it determines if they click "See more."
- Use line breaks aggressively. One thought per line. White space = readability on LinkedIn.
- Include numbers. LinkedIn algorithm loves specific numbers.
- End with a CTA + article link if a URL is provided.

STRUCTURE:
- Hook (1 provocative line that creates curiosity)
- Context (2-3 lines explaining the problem)
- 3-5 key insights as a numbered list (1. ... 2. ... 3. ...)
- Bottom line (1 sentence takeaway)
- Question to drive engagement
- Article link if provided

CONSTRAINTS:
- Max 1,300 characters total (LinkedIn sweet spot — count carefully).
- No more than 2 emojis total. Often zero is better.
- No hashtags inside the post. (User adds them in the first comment if they want.)
- No buzzwords: "leveraging," "synergies," "paradigm," "transformation."
- Output ONLY the LinkedIn post. No preamble, no explanation, no markdown, no surrounding quotes.`;

const SYSTEM_PROMPT_VYTALMED = `You write LinkedIn posts for VytalMed — an AI-native radiology operations platform owned by Radiology Imaging Associates (RIA), built and powered by Nymbl. Live production at RIA. Audience: radiology group executives, hospital CIOs/COOs, PE investors with radiology assets.

VOICE & STYLE — confident operator. Direct, production-proof, no marketing fluff.
- Hook with a real workflow reality, a production number, or an operational truth that a CIO would recognize.
- Line breaks aggressively. One thought per line.
- Speak in operator language: workflows, queue times, headcount, throughput, error rates.
- End with a soft CTA and link if provided.

STRUCTURE:
- Hook (1 line — a production reality or operator pain that makes a CIO stop scrolling)
- Context (2-3 lines — what's broken in most radiology ops today)
- 3-5 specifics as a numbered list (1. ... 2. ... 3. ...) — what VytalMed does, what production looks like, why standardized SaaS can't do this
- Bottom line (1 sentence — production-truth, not marketing)
- Question to spark engagement (something operators would actually answer)
- Article link if provided

CONSTRAINTS:
- Max 1,300 characters.
- No more than 2 emojis. Usually zero.
- No hashtags inside the post.
- No buzzwords: "leveraging," "synergies," "transformation," "revolutionary," "next-generation."
- Do NOT make up RIA production numbers — only use specifics from the source content.
- Output ONLY the LinkedIn post. No preamble, no explanation, no markdown, no surrounding quotes.`;

const VALID_BRANDS = ['marcos', 'vytalmed'];

export async function handle(body) {
    const { brand = 'marcos', blog_html, topic, transcript, blog_url } = body || {};

    if (!VALID_BRANDS.includes(brand)) throwHttp(400, `brand must be one of: ${VALID_BRANDS.join(', ')}`);
    if (!blog_html && !topic && !transcript) throwHttp(400, 'Provide blog_html, topic, or transcript');

    const system = brand === 'vytalmed' ? SYSTEM_PROMPT_VYTALMED : SYSTEM_PROMPT_MARCOS;

    let userContent;
    if (blog_html) {
        userContent = `Write a LinkedIn post that drives traffic to this blog article. Use the article's hook and key insights but make the LinkedIn post stand alone (someone who never clicks the link should still get value).\n\nARTICLE HTML:\n${blog_html}`;
    } else if (transcript) {
        userContent = `Write a LinkedIn post based on this transcript. Pick the strongest hook and 3-5 insights from it.\n\nTRANSCRIPT:\n${transcript}`;
    } else {
        userContent = `Write a LinkedIn post on this topic: "${topic}".`;
    }

    if (blog_url) {
        userContent += `\n\nLink to include at the end of the post: ${blog_url}`;
    } else {
        userContent += `\n\nNo URL provided — end with the question/CTA only, no link.`;
    }

    const result = await callClaude({
        system,
        temperature: 0.85,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userContent }]
    });

    return {
        success: true,
        brand,
        post: result.text.trim(),
        char_count: result.text.trim().length,
        model: result.model,
        usage: result.usage
    };
}

function throwHttp(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
}
