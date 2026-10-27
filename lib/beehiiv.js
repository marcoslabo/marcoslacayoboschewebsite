// ==========================================================================
// beehiiv helper
// Single place that adds a subscriber to the Watch the Work newsletter.
// Used by /api/subscribe (site forms) and /api/grader-submit (Diagnose opt-in).
//
// Env (set in Vercel):
//   BEEHIIV_API_KEY         — beehiiv API key
//   BEEHIIV_PUBLICATION_ID  — starts with "pub_"
// ==========================================================================

const BEEHIIV_API_URL = 'https://api.beehiiv.com/v2';

export const ROLES = ['physician', 'operations-leader', 'practice-owner', 'builder', 'other'];

/**
 * Add (or re-activate) a newsletter subscriber.
 *
 * @param {object} opts
 * @param {string} opts.email       Required.
 * @param {string} [opts.firstName]
 * @param {string} [opts.role]      One of ROLES.
 * @param {string} [opts.source]    Where they signed up (e.g. "homepage", "download:value-stream-map", "diagnose").
 * @returns {Promise<{ok:boolean, id?:string}>}
 * @throws Error with .status when beehiiv isn't configured or rejects the request.
 */
export async function subscribe({ email, firstName, role, source } = {}) {
    const apiKey = process.env.BEEHIIV_API_KEY;
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
    if (!apiKey || !publicationId) {
        const err = new Error('Newsletter is not configured yet');
        err.status = 503;
        throw err;
    }

    const customFields = [];
    if (firstName) customFields.push({ name: 'First Name', value: firstName });
    if (role) customFields.push({ name: 'Role', value: role });

    const base = {
        email,
        reactivate_existing: true,
        // The welcome email is a beehiiv automation triggered on signup
        send_welcome_email: false,
        utm_source: source || 'website',
        utm_medium: 'website',
        referring_site: 'https://www.marcoslacayobosche.com'
    };

    let resp = await post(apiKey, publicationId, { ...base, custom_fields: customFields });

    // Custom fields must exist in beehiiv first; if they don't, keep the signup anyway
    if (!resp.ok && customFields.length > 0 && resp.status === 400) {
        console.warn('beehiiv rejected custom fields, retrying without them:', await resp.text());
        resp = await post(apiKey, publicationId, base);
    }

    if (!resp.ok) {
        const body = await resp.text();
        console.error('beehiiv subscribe failed:', resp.status, body.slice(0, 300));
        const err = new Error('Could not subscribe right now');
        err.status = 502;
        throw err;
    }

    const data = await resp.json().catch(() => ({}));
    return { ok: true, id: data?.data?.id };
}

function post(apiKey, publicationId, body) {
    return fetch(`${BEEHIIV_API_URL}/publications/${publicationId}/subscriptions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });
}

/**
 * Iterate every subscriber in the publication (active by default), with
 * stats and custom fields expanded. Handles both cursor and page pagination.
 *
 * @param {object} [opts]
 * @param {number} [opts.maxPages=50]  Safety cap (100 per page).
 * @returns {AsyncGenerator<object>}
 */
export async function* listSubscriptions({ maxPages = 50 } = {}) {
    const apiKey = process.env.BEEHIIV_API_KEY;
    const publicationId = process.env.BEEHIIV_PUBLICATION_ID;
    if (!apiKey || !publicationId) {
        const err = new Error('Newsletter is not configured yet');
        err.status = 503;
        throw err;
    }

    let page = 1;
    let cursor = null;
    for (let i = 0; i < maxPages; i++) {
        const params = new URLSearchParams({ limit: '100', status: 'active' });
        params.append('expand[]', 'stats');
        params.append('expand[]', 'custom_fields');
        if (cursor) params.set('cursor', cursor);
        else params.set('page', String(page));

        const resp = await fetch(`${BEEHIIV_API_URL}/publications/${publicationId}/subscriptions?${params}`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        });
        if (!resp.ok) {
            const err = new Error(`beehiiv list failed: ${resp.status} ${(await resp.text()).slice(0, 200)}`);
            err.status = 502;
            throw err;
        }

        const body = await resp.json();
        for (const sub of body.data || []) yield sub;

        if (body.next_cursor) {
            cursor = body.next_cursor;
        } else if (body.total_pages && page < body.total_pages) {
            page += 1;
        } else {
            return;
        }
    }
}
