// ==========================================================================
// Anthropic API helper
// Single source of truth for "how do we talk to Claude."
// All agents and the generic /api/claude endpoint import callClaude from here.
// ==========================================================================

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

/**
 * Call the Anthropic Messages API.
 *
 * @param {object}   opts
 * @param {Array<{role:'user'|'assistant', content:string}>} opts.messages  Required.
 * @param {string}   [opts.system]      System prompt.
 * @param {string}   [opts.model]       Defaults to claude-sonnet-4-6.
 * @param {number}   [opts.max_tokens]  Defaults to 4096.
 * @param {number}   [opts.temperature] Defaults to 0.7.
 *
 * @returns {Promise<{text:string, model:string, stop_reason:string, usage:object}>}
 *
 * @throws Error with .status if the API call fails or env is missing.
 */
export async function callClaude({
    messages,
    system,
    model = DEFAULT_MODEL,
    max_tokens = 4096,
    temperature = 0.7
} = {}) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        const err = new Error('ANTHROPIC_API_KEY not configured');
        err.status = 500;
        throw err;
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        const err = new Error('messages array is required');
        err.status = 400;
        throw err;
    }

    // temperature is not supported on claude-opus-4-7+
    const supportsTemperature = !model.includes('opus-4-7');
    const payload = { model, max_tokens, messages };
    if (supportsTemperature) payload.temperature = temperature;
    if (system) payload.system = system;

    const res = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': ANTHROPIC_API_VERSION
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
        console.error('Anthropic API error:', res.status, data);
        const err = new Error(data.error?.message || `Anthropic error: ${res.status}`);
        err.status = res.status;
        throw err;
    }

    const text = (data.content || [])
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');

    return {
        text,
        model: data.model,
        stop_reason: data.stop_reason,
        usage: data.usage
    };
}
