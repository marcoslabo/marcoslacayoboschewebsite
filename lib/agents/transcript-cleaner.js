// ==========================================================================
// Transcript Cleaner Agent — pure handler module
// ==========================================================================

import { callClaude } from '../anthropic.js';

const SYSTEM_PROMPT_BASE = `You are a transcript cleaner for a podcast/video pipeline. The user pastes a raw transcript export from Descript, Otter, Riverside, or similar tools. Your job is to produce a CLEANED version that's ready for human consumption — not to summarize, not to rewrite, not to interpret.

CLEANING RULES:
- Remove filler words: "um", "uh", "like" (when used as filler), "you know", "I mean", "kind of" (when used as filler), "sort of", "basically" (when used as filler).
- Remove false starts and self-corrections. If someone says "I think it's — actually, it's the third one," output "It's the third one."
- Remove repeated words: "the the system" becomes "the system."
- Fix punctuation and capitalization. Add commas, periods, and paragraph breaks where natural.
- Preserve speaker structure if the input has speaker labels (e.g., "Marcos:", "Speaker 1:"). Keep them as-is.
- Do NOT paraphrase. Do NOT summarize. Do NOT change meaning. Only clean.
- Keep technical terms, jargon, numbers, and proper nouns exactly as the speaker said them (or in their corrected form per the brand glossary below).
- Break into reasonable paragraphs (every 3-5 sentences or at topic shifts) for readability.

OUTPUT:
Output ONLY the cleaned transcript text. No preamble, no commentary, no markdown headers. Just the cleaned text.`;

const GLOSSARY_MARCOS = `BRAND GLOSSARY — fix these spellings if they appear mistranscribed:
- "Nymbl" (not "nimble", "nimbal", "nimbel")
- "Marcos Bosche" (not "marco" or "boshay")
- "AWS" (not "a w s")
- "TEDx" (not "ted x")`;

const GLOSSARY_VYTALMED = `BRAND GLOSSARY — fix these spellings if they appear mistranscribed:
- "VytalMed" (not "vital med", "vitalmed", "vytal med")
- "RIA" (not "ria" lowercase, "rea", "r-i-a")
- "Radiology Imaging Associates" (full name)
- "VytalDocs" (not "vital docs", "vytal docs")
- "VytalMap" (not "vital map", "vytal map")
- "VytalSurge" (not "vital surge", "vytal surge")
- "VytalList" (not "vital list", "vytal list")
- "Nymbl" (not "nimble", "nimbal")
- "HL7" (not "h l 7", "hl seven")
- "Epic" (the EHR system, capitalized)`;

const VALID_BRANDS = ['marcos', 'vytalmed'];

export async function handle(body) {
    const { brand = 'marcos', transcript } = body || {};

    if (!VALID_BRANDS.includes(brand)) throwHttp(400, `brand must be one of: ${VALID_BRANDS.join(', ')}`);
    if (!transcript || typeof transcript !== 'string' || transcript.trim().length < 20) {
        throwHttp(400, 'transcript is required (min 20 chars)');
    }

    const glossary = brand === 'vytalmed' ? GLOSSARY_VYTALMED : GLOSSARY_MARCOS;
    const system = `${SYSTEM_PROMPT_BASE}\n\n${glossary}`;

    const result = await callClaude({
        system,
        temperature: 0.3,
        messages: [{
            role: 'user',
            content: `Clean the following transcript per the rules.\n\nRAW TRANSCRIPT:\n${transcript}\n\nOutput the cleaned transcript now.`
        }]
    });

    return {
        success: true,
        brand,
        cleaned: result.text.trim(),
        model: result.model,
        usage: result.usage
    };
}

function throwHttp(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
}
