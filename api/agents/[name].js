// ==========================================================================
// Agents dispatcher (single Vercel function for all agent endpoints)
//
// Vercel routes everything matching /api/agents/* to this file.
// req.query.name comes from the dynamic [name].js segment.
//
// Adding a new agent: drop a module at lib/agents/<name>.js exporting handle(body),
// then add it to the HANDLERS map below. No new Vercel function is consumed.
// ==========================================================================

import { handle as blogWriter }        from '../../lib/agents/blog-writer.js';
import { handle as transcriptCleaner } from '../../lib/agents/transcript-cleaner.js';
import { handle as episodeSummary }    from '../../lib/agents/episode-summary.js';
import { handle as linkedinWriter }    from '../../lib/agents/linkedin-writer.js';
import { handle as inboundTriage }     from '../../lib/agents/inbound-triage.js';

const HANDLERS = {
    'blog-writer':        blogWriter,
    'transcript-cleaner': transcriptCleaner,
    'episode-summary':    episodeSummary,
    'linkedin-writer':    linkedinWriter,
    'inbound-triage':     inboundTriage
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const name = req.query.name;
    const fn = HANDLERS[name];
    if (!fn) {
        return res.status(404).json({
            error: `Unknown agent: ${name}. Available: ${Object.keys(HANDLERS).join(', ')}`
        });
    }

    try {
        const result = await fn(req.body || {});
        return res.status(200).json(result);
    } catch (e) {
        console.error(`agent ${name} error:`, e);
        const status = e.status || 500;
        return res.status(status).json({ error: e.message || `Agent ${name} failed` });
    }
}
