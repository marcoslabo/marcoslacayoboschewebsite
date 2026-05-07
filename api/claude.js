// ==========================================================================
// Anthropic Claude API endpoint
// Generic low-level wrapper, parallel to api/openai.js
// Used by api/agents/* endpoints. Can also be called directly for ad-hoc work.
// ==========================================================================

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        console.error('ANTHROPIC_API_KEY not found in environment');
        return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    try {
        const {
            messages,
            system,
            model = 'claude-sonnet-4-6',
            max_tokens = 4096,
            temperature = 0.7
        } = req.body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return res.status(400).json({ error: 'messages array is required' });
        }

        const payload = { model, max_tokens, temperature, messages };
        if (system) payload.system = system;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Anthropic API error:', response.status, data);
            return res.status(response.status).json({
                error: data.error?.message || `Anthropic error: ${response.status}`
            });
        }

        // Normalize output: pull out the first text block, expose usage stats
        const text = (data.content || [])
            .filter(b => b.type === 'text')
            .map(b => b.text)
            .join('\n');

        return res.status(200).json({
            success: true,
            text,
            model: data.model,
            stop_reason: data.stop_reason,
            usage: data.usage
        });
    } catch (error) {
        console.error('Anthropic API exception:', error);
        return res.status(500).json({ error: error.message || 'Failed to call Anthropic API' });
    }
}
