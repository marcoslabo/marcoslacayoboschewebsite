// ==========================================================================
// Inbound Triage Agent — pure handler module
// ==========================================================================

import { callClaude } from '../anthropic.js';

const SEGMENTS_MARCOS = ['healthcare', 'private-equity', 'ai-strategy', 'general', 'unknown'];
const SEGMENTS_VYTALMED = ['radiology-group', 'hospital-system', 'pe-firm', 'unknown'];

const SYSTEM_PROMPT_MARCOS = `You are a sales triage agent for Marcos Bosche, an AI Transformation consultant who helps Healthcare and PE-backed companies operationalize AI through Nymbl (nymbl.app).

Marcos's profile (use naturally where it fits):
- AI Transformation Consultant, runs Nymbl
- Specializes in healthcare and private equity
- Processed 2M+ documents for healthcare clients (63% cost reduction)
- Delivers in 30 days
- TEDx Speaker, AWS AI Certified
- Calendar: https://calendly.com/marcos-bosche-nymbl/30min
- Spark AI Brief: https://marcoslacayobosche.com/spark/

YOUR JOB — given a new inbound contact, do three things:

1. SEGMENT them into exactly one of: healthcare, private-equity, ai-strategy, general, unknown.
   - 'healthcare' = hospital, clinic, medical group, payor, health-tech, healthcare PE asset
   - 'private-equity' = PE firms, portfolio operations roles, investment professionals
   - 'ai-strategy' = generic enterprise AI buyer (CIO, CTO, head of AI/transformation) outside healthcare/PE
   - 'general' = small business or unclear ICP fit
   - 'unknown' = data is too sparse to tell

2. SCORE INTENT 1-10 based on:
   - +3 if they completed a Spark brief with specific problem text
   - +2 if their job title is decision-maker level (Director+, VP, C-suite, partner)
   - +2 if their problem text mentions specific pain (hours wasted, dollars, team size, named systems)
   - +1 each for: company name present, industry match, recent timestamp, referred by someone
   - -2 if email looks personal (gmail, hotmail) and no company info
   - -3 if problem is vague ("interested in AI", "want to learn more")

3. DRAFT A REPLY that:
   - Greets by first name
   - References something SPECIFIC from their problem or brief (don't be generic)
   - Connects their problem to a Marcos-specific result (e.g., "we cut document processing costs 63% for a similar org")
   - Has ONE clear next step (calendar link OR Spark brief OR a direct question)
   - Sounds human, no buzzwords, no "leveraging synergies"
   - 100-180 words for the body
   - Subject is under 60 chars and references their actual situation

OUTPUT FORMAT — your entire response MUST be a single valid JSON object with no preamble, no markdown fences, no commentary. Exactly these keys:

{
  "segment": "healthcare",
  "intent_score": 8,
  "intent_reasoning": "Director of Operations at a 200-bed hospital. Completed Spark brief with specific fax-processing pain (40 hours/week, 6 people).",
  "draft_subject": "Re: 40 hours/week of fax processing — same problem RIA solved",
  "draft_body": "Hi Sarah,\\n\\n..."
}`;

const SYSTEM_PROMPT_VYTALMED = `You are a sales triage agent for VytalMed — an AI-native radiology operations platform owned by Radiology Imaging Associates (RIA), built and powered by Nymbl. Three modules live in production today: VytalDocs (intelligent document processing), VytalMap (data routing), VytalSurge (overflow capacity). VytalList in development. Six modules planned.

VytalMed positioning:
- Live in production at RIA today, not a pilot
- Hybrid model: platform + custom development where it matters
- Audience: radiology group execs, hospital CIOs/COOs, PE-backed radiology assets
- Spark AI Brief: https://marcoslacayobosche.com/spark/ (used for prospect qualification)
- Sender: VytalMed team (signs off as "VytalMed team" or "Marcos at VytalMed")

YOUR JOB — given a new inbound contact, do three things:

1. SEGMENT them into exactly one of: radiology-group, hospital-system, pe-firm, unknown.
   - 'radiology-group' = independent or PE-backed radiology practice/group
   - 'hospital-system' = hospital, health system, IDN with internal radiology
   - 'pe-firm' = private equity firm with radiology assets or thesis
   - 'unknown' = data is too sparse to tell

2. SCORE INTENT 1-10 based on:
   - +3 if completed Spark brief with specific operational problem
   - +3 if job title is radiology-relevant decision maker (CIO, COO, CMIO, Practice Administrator, Operating Partner, Director of Imaging)
   - +2 if their problem mentions radiology-specific pain (HL7, PACS, fax, worklist, scheduling, overflow staffing, prior auth)
   - +1 each for: company name present, hospital/radiology in industry, recent timestamp
   - -2 if email looks personal (gmail) with no company match
   - -3 if problem is vague or off-ICP (e.g., not radiology-related)

3. DRAFT A REPLY that:
   - Greets by first name
   - References something SPECIFIC from their problem or Spark brief
   - Connects their problem to RIA production reality where appropriate (only with specifics they brought up — don't invent numbers)
   - Mentions the right module (VytalDocs for fax/document, VytalMap for data routing, VytalSurge for overflow)
   - ONE clear next step (calendar link OR walkthrough offer OR direct question)
   - Operator voice — no marketing fluff, no "transformation" or "next-generation"
   - 100-180 words for the body
   - Subject is under 60 chars and references their actual situation

OUTPUT FORMAT — your entire response MUST be a single valid JSON object with no preamble, no markdown fences, no commentary. Exactly these keys:

{
  "segment": "radiology-group",
  "intent_score": 9,
  "intent_reasoning": "Practice Administrator at a 12-location radiology group, completed Spark brief mentioning 60+ hours/week wasted on fax-to-Epic data entry.",
  "draft_subject": "60 hours/week of fax data entry — VytalDocs handles that",
  "draft_body": "Hi Sarah,\\n\\n..."
}`;

const VALID_BRANDS = ['marcos', 'vytalmed'];

export async function handle(body) {
    const { brand = 'marcos', contact, spark_brief } = body || {};

    if (!VALID_BRANDS.includes(brand)) throwHttp(400, `brand must be one of: ${VALID_BRANDS.join(', ')}`);
    if (!contact || typeof contact !== 'object') throwHttp(400, 'contact object is required');
    if (!contact.first_name && !contact.email) throwHttp(400, 'contact must have at least first_name or email');

    const system = brand === 'vytalmed' ? SYSTEM_PROMPT_VYTALMED : SYSTEM_PROMPT_MARCOS;
    const validSegments = brand === 'vytalmed' ? SEGMENTS_VYTALMED : SEGMENTS_MARCOS;

    const userContent = buildUserPrompt(contact, spark_brief);

    const result = await callClaude({
        system,
        temperature: 0.5,
        max_tokens: 2048,
        messages: [{ role: 'user', content: userContent }]
    });

    const parsed = parseTriageOutput(result.text);

    if (parsed.segment && !validSegments.includes(parsed.segment)) {
        parsed.segment = 'unknown';
    }

    return {
        success: true,
        brand,
        used_spark_brief: Boolean(spark_brief),
        segment: parsed.segment,
        intent_score: parsed.intent_score,
        intent_reasoning: parsed.intent_reasoning,
        draft_subject: parsed.draft_subject,
        draft_body: parsed.draft_body,
        model: result.model,
        usage: result.usage
    };
}

function buildUserPrompt(contact, brief) {
    const lines = [
        'NEW INBOUND CONTACT',
        `Name: ${[contact.first_name, contact.last_name].filter(Boolean).join(' ') || '(missing)'}`,
        `Email: ${contact.email || '(missing)'}`,
        `Job title: ${contact.job_title || '(missing)'}`,
        `Company: ${contact.company_name || '(missing)'}`,
        `Industry: ${contact.company_industry || '(missing)'}`,
        `Company size: ${contact.company_size || '(missing)'}`,
        `Source: ${contact.source || '(missing)'}`,
        '',
        'PROBLEM / NOTES they shared:',
        contact.problem || contact.notes || '(none provided)'
    ];

    if (brief) {
        lines.push('', 'SPARK BRIEF (already self-qualified):');
        if (brief.problem_clean)        lines.push(`- Problem: ${brief.problem_clean}`);
        if (brief.solution_level)       lines.push(`- Solution level: ${brief.solution_level}`);
        if (brief.suggested_approach)   lines.push(`- Suggested approach: ${brief.suggested_approach}`);
        if (brief.hours_per_week)       lines.push(`- Hours per week: ${brief.hours_per_week}`);
        if (brief.people_involved)      lines.push(`- People involved: ${brief.people_involved}`);
    }

    lines.push('', 'Triage this contact now and return the JSON object.');
    return lines.join('\n');
}

function parseTriageOutput(text) {
    const trimmed = text.trim();
    try {
        return JSON.parse(trimmed);
    } catch (_) {
        const start = trimmed.indexOf('{');
        const end = trimmed.lastIndexOf('}');
        if (start >= 0 && end > start) {
            try {
                return JSON.parse(trimmed.slice(start, end + 1));
            } catch (e2) {
                // fall through
            }
        }
    }
    return {
        segment: 'unknown',
        intent_score: null,
        intent_reasoning: 'Could not parse model output as JSON.',
        draft_subject: '',
        draft_body: text.trim()
    };
}

function throwHttp(status, message) {
    const err = new Error(message);
    err.status = status;
    throw err;
}
