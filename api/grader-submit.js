// ==========================================================================
// POST /api/grader-submit
// Persists a Grader result + email to Supabase (grader_submissions table).
// Server-side so we can use the service role to bypass RLS edge cases.
// ==========================================================================

const SUPABASE_URL = 'https://eccodohheekwbywifipl.supabase.co';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Supabase key not configured' });
    }

    const {
        practice,
        fallback_specialty,
        analysis,
        email
    } = req.body || {};

    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    if (!analysis || typeof analysis.risk_score !== 'number') {
        return res.status(400).json({ error: 'Analysis payload required' });
    }

    const row = {
        practice_name: practice?.name || null,
        npi_number: practice?.npi || null,
        practice_metadata: practice ? {
            type: practice.type,
            specialty: practice.specialty,
            city: practice.city,
            state: practice.state,
            taxonomies: practice.taxonomies
        } : null,
        fallback_specialty: fallback_specialty || null,
        risk_score: analysis.risk_score,
        risk_grade: analysis.risk_grade || null,
        risk_breakdown: analysis.risk_breakdown || null,
        top_patterns: analysis.top_patterns || null,
        headline: analysis.headline || null,
        email: email.trim().toLowerCase()
    };

    try {
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/grader_submissions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
                'Authorization': `Bearer ${apiKey}`,
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(row)
        });

        if (!resp.ok) {
            const errBody = await resp.text();
            console.error('Supabase insert failed:', resp.status, errBody);
            return res.status(resp.status).json({ error: 'Failed to save submission' });
        }

        const inserted = await resp.json();
        return res.status(200).json({ id: inserted[0]?.id, ok: true });
    } catch (e) {
        console.error('Grader submit error:', e);
        return res.status(500).json({ error: 'Failed to save submission' });
    }
}
