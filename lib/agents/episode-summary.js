// ==========================================================================
// Episode Summary Agent — pure handler module
// ==========================================================================

import { callClaude } from '../anthropic.js';

const SYSTEM_PROMPT_MARCOS = `You write episode summaries for the Marcos Lacayo Bosche YouTube channel — an AI Transformation consultant who helps Healthcare and PE-backed companies operationalize AI through Nymbl (nymbl.app).

VOICE: punchy, confident, Hormozi-style. Lead with a real number or insight. No fluff.

OUTPUT FORMAT — your response MUST follow this exact structure with no other text:

YOUTUBE_DESCRIPTION:
<a 120-180 word description of this episode. Open with a hook (the most surprising or specific insight). Then 2-3 sentences of context. End with a CTA: "Need help operationalizing AI? Visit marcoslacayobosche.com" or "Try the Spark AI Brief at marcoslacayobosche.com/spark/" — pick whichever fits the episode topic better.>

SOCIAL_TEASE:
<one sentence under 200 characters. Punchy, hook-style. Suitable as a LinkedIn opening line OR an email subject line. No emojis.>

CONSTRAINTS:
- Do NOT include timestamps unless the user provides them.
- Do NOT make up numbers — only use specifics that appear in the transcript.
- Do NOT use buzzwords like "transformation," "synergies," "leveraging," "next-generation."`;

const SYSTEM_PROMPT_VYTALMED = `You write episode summaries for VytalMed — an AI-native radiology operations platform owned by Radiology Imaging Associates (RIA), built and powered by Nymbl. Three modules live in production today (VytalDocs, VytalMap, VytalSurge), VytalList in progress, six total planned.

AUDIENCE: radiology group executives, hospital CIOs/COOs, PE investors with radiology assets.

VOICE: confident operator. Production-proof, not marketing fluff. Reference real workflows and operational realities.

OUTPUT FORMAT — your response MUST follow this exact structure with no other text:

YOUTUBE_DESCRIPTION:
<a 120-180 word description of this episode. Open with a real production reality (a workflow problem, a number, a moment from the field). Then 2-3 sentences of context. End with a CTA: "Request a Spark Brief at vytalmed.co" or "See if your workflow fits — vytalmed.co" — pick whichever fits the episode better.>

SOCIAL_TEASE:
<one sentence under 200 characters. Operator-direct. Suitable as a LinkedIn opening line for a CIO/COO audience OR an email subject line. No emojis.>

CONSTRAINTS:
- Do NOT make up RIA production numbers — only use ones that appear in the transcript.
- Do NOT use buzzwords like "transformation," "synergies," "leveraging," "revolutionary."
- Mention specific VytalMed module names (VytalDocs, VytalMap, VytalSurge, VytalList) only if the transcript references them.`;

const VALID_BRANDS = ['marcos', 'vytalmed'];

export async function handle(body) {
    const { brand = 'marcos', transcript, topic } = body || {};

    if (!VALID_BRANDS.includes(brand)) throwHttp(400, `brand must be one of: ${VALID_BRANDS.join(', ')}`);
    if (!transcript && !topic) throwHttp(400, 'Either transcript or topic is required');

    const system = brand === 'vytalmed' ? SYSTEM_PROMPT_VYTALMED : SYSTEM_PROMPT_MARCOS;

    const userContent = transcript
        ? `Write an episode summary for this transcript. Use the exact output format.\n\nTRANSCRIPT:\n${transcript}`
        : `Write an episode summary for an episode on this topic: "${topic}". Use the exact output format.`;

    const result = await callClaude({
        system,
        temperature: 0.7,
        max_tokens: 1024,
        messages: [{ role: 'user', content: userContent }]
    });

    return {
        success: true,
        brand,
        ...parseSummaryOutput(result.text),
        model: result.model,
        usage: result.usage
    };
}

function parseSummaryOutput(text) {
    const ytMatch = text.match(/YOUTUBE_DESCRIPTION:\s*([\s\S]+?)(?:\n\s*SOCIAL_TEASE:|$)/);
    const teaseMatch = text.match(/SOCIAL_TEASE:\s*(.+?)(?:\n|$)/);
    return {
        youtube_description: ytMatch ? ytMatch[1].trim() : text.trim(),
        social_tease: teaseMatch ? teaseMatch[1].trim() : ''
    };
}

function throwHttp(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
}
