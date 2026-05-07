// ==========================================================================
// POST /api/claude
// Generic Anthropic endpoint. Thin wrapper around lib/anthropic.js.
// Used for ad-hoc Claude calls; agents have their own dedicated endpoints.
// ==========================================================================

import { callClaude } from '../lib/anthropic.js';

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const result = await callClaude(req.body || {});
        return res.status(200).json({ success: true, ...result });
    } catch (e) {
        console.error('api/claude error:', e);
        const status = e.status || 500;
        return res.status(status).json({ error: e.message || 'Failed to call Anthropic API' });
    }
}
