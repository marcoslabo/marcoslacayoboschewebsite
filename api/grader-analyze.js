// ==========================================================================
// POST /api/grader-analyze
// Body: { practice: {npi, type, name, specialty, city, state, taxonomies} }
//        OR { fallback_specialty: 'Radiology' | ... }
// Returns a Workflow Risk Score from Claude grounded in VytalMed deployment patterns.
// ==========================================================================

import { callClaude } from '../lib/anthropic.js';

const SYSTEM_PROMPT = `You are the VytalMed Workflow Risk analyst. VytalMed is a healthcare software development agency that has run 125+ deployments across radiology, multi-specialty groups, hospital systems, and PE-backed operators.

Score a US healthcare practice's workflow risk from 0-100 across 5 axes (0-20 each). Higher = more dysfunction = more value VytalMed can deliver.

THE 5 AXES
1. Automation gap — how much manual data entry / clerical work likely remains (faxes, intake, schedules built in Excel)
2. Integration burden — how many systems data must flow between (EMR, PACS, billing, scheduling, fax, reporting) and how reliably
3. Vendor lock-in — how trapped they likely are by their SaaS vendors (the "60% solution" trap from the deck)
4. AI readiness — how usable their data is for AI use cases (structured? clean? labeled?)
5. Patient impact — how many patient-touching delays the workflow creates (diagnosis, intake, follow-up)

EVIDENCE BASE — VytalMed builds custom healthcare software. The 6 patterns below are PROVEN deployments at RIA (radiology), shown as examples of what they ship. They are NOT the menu. Generate top_patterns specific to THIS practice's specialty, size, and likely workflow — radiology, cardiology, oncology, orthopedics, primary care, surgery centers, hospital systems, and PE-backed operators all have different bottlenecks.

EXAMPLES OF SHIPPED DEPLOYMENTS (use as proof of capability, not as the only options):
- Fax-to-EMR manual data entry (radiology, multi-site)
- AI worklist routing by urgency + subspecialty (>100K studies/yr)
- HL7 standardization across sites (>3 locations)
- Schedule build complexity (>50 providers, Excel-based today)
- Overflow staffing automation (hospital weekend/holiday surge)
- Clinical data auto-population into reports

OTHER WORKFLOW PATTERNS COMMONLY FOUND IN HEALTHCARE (reason about which apply to THIS practice):
- Prior authorization automation (cardiology, oncology, ortho, MSK imaging — anywhere PAs gate procedures)
- Claims denial workflow (RCM, A/R aging, payer-specific rules)
- Patient intake & insurance verification (any outpatient)
- Telemedicine routing & visit prep (primary care, behavioral health)
- RVU tracking & physician comp transparency (groups with productivity comp)
- Contract management & negotiation prep (multi-payer practices)
- MIPS / quality reporting automation (any Medicare-billing)
- OR turnover & block scheduling (surgery centers, hospital ORs)
- Pharmacy / med reconciliation (hospital, oncology, post-acute)
- Referral lifecycle tracking (specialists, ambulatory)
- Population health stratification (ACOs, value-based care)
- Document generation (op notes, discharge summaries, prior auth letters)
- Patient communication & no-show reduction (any volume practice)
- Audit & compliance evidence collection (HIPAA, OIG, state-specific)
- Custom dashboards for operators (any size — most stitch reports manually)

This list is also not exhaustive. The point: pick patterns from what the practice's specialty + size + multi-site profile would actually struggle with. Be specific. The credibility comes from naming the RIGHT pain, not the most-common pain.

GRADING SCALE
90-100 → A (Healthy — VytalMed not urgent)
75-89  → B (Functional — opportunistic improvements)
60-74  → C (Patient — clear pain, ROI obvious)
40-59  → D (Vendor Trapped — high urgency)
0-39   → F (Critical — the deck was written for this exact buyer)

HEADLINE TONE
- "Healthy", "Functional", "Patient", "Vendor Trapped", "Critical"
- Match the deck's anti-vendor, operator-respecting voice. No hype. No emojis in headlines.

RETURN ONLY JSON (no markdown, no prose):
{
  "risk_score": 0-100 integer,
  "risk_grade": "A" | "B" | "C" | "D" | "F",
  "headline": "<one short line, e.g. 'Vendor Trapped'>",
  "risk_breakdown": {
    "automation": 0-20,
    "integration": 0-20,
    "vendor_lock_in": 0-20,
    "ai_readiness": 0-20,
    "patient_impact": 0-20
  },
  "top_patterns": [
    { "title": "<short pattern name>", "why_it_applies": "<one sentence grounded in their NPI/specialty/size>", "fix": "<one sentence, what VytalMed would build>" },
    { ... },
    { ... }
  ]
}

Pick exactly 3 top_patterns. The "why_it_applies" MUST reference something specific about THIS practice (specialty, size, multi-site, location) — that's the credibility signal.`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { practice, fallback_specialty } = req.body || {};

    if (!practice && !fallback_specialty) {
        return res.status(400).json({ error: 'practice or fallback_specialty required' });
    }

    // Build a compact, factual context block for Claude
    let context;
    if (practice) {
        context = [
            `Practice: ${practice.name || 'Unknown'}`,
            practice.type ? `Type: ${practice.type === 'organization' ? 'Group/Organization' : 'Individual provider'}` : '',
            practice.specialty ? `Primary specialty: ${practice.specialty}` : '',
            practice.taxonomies?.length > 1 ? `Other taxonomies: ${practice.taxonomies.slice(1).join(', ')}` : '',
            practice.city || practice.state ? `Location: ${[practice.city, practice.state].filter(Boolean).join(', ')}` : '',
            practice.npi ? `NPI: ${practice.npi}` : ''
        ].filter(Boolean).join('\n');
    } else {
        context = `Specialty (no NPI match): ${fallback_specialty}\nNo organization-level data available; score against typical patterns for this specialty.`;
    }

    try {
        const { text } = await callClaude({
            model: 'claude-opus-4-7',
            max_tokens: 1500,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `Score this practice.\n\n${context}` }]
        });

        const parsed = parseJson(text);
        if (!parsed) {
            console.error('Grader analyze: failed to parse JSON', text);
            return res.status(500).json({ error: 'Could not parse analyzer response' });
        }

        return res.status(200).json(parsed);
    } catch (e) {
        console.error('Grader analyze error:', e);
        const status = e.status || 500;
        return res.status(status).json({ error: e.message || 'Grader analyze failed' });
    }
}

function parseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { return null; }
        }
        return null;
    }
}
