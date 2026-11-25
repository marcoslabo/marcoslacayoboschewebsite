// ==========================================================================
// Brevo contacts: the one email list.
// Every sign-up (site forms, 5-day course, agent finder opt-in, Skool via
// Zapier) is saved as a Brevo contact in the "Website sign-ups" list, with
// FIRSTNAME and SOURCE ("5-days · instagram"). The blog newsletter
// (api/send-blog.js) and the welcome emails (lib/welcome.js) send from Brevo.
//
// Env: BREVO_API_KEY. Optional BREVO_SIGNUP_LIST_ID; without it the list is
// found by name, or created in the MarcosLacayoBosche folder.
// ==========================================================================

const API = 'https://api.brevo.com/v3';
export const SIGNUP_LIST_NAME = 'Website sign-ups';
let cachedListId = null;

async function brevo(path, { method = 'GET', body } = {}) {
    const key = process.env.BREVO_API_KEY;
    if (!key) {
        const err = new Error('Email list is not configured yet');
        err.status = 503;
        throw err;
    }
    const resp = await fetch(`${API}${path}`, {
        method,
        headers: { accept: 'application/json', 'content-type': 'application/json', 'api-key': key },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await resp.text();
    if (!resp.ok) {
        const err = new Error(`Brevo ${resp.status}: ${text.slice(0, 200)}`);
        err.status = resp.status;
        throw err;
    }
    return text ? JSON.parse(text) : {};
}

/** The "Website sign-ups" list id: env, then by name, then create it. */
export async function signupListId() {
    if (process.env.BREVO_SIGNUP_LIST_ID) return Number(process.env.BREVO_SIGNUP_LIST_ID);
    if (cachedListId) return cachedListId;

    for (let offset = 0; offset < 500; offset += 50) {
        const { lists = [] } = await brevo(`/contacts/lists?limit=50&offset=${offset}`);
        const found = lists.find(l => l.name === SIGNUP_LIST_NAME);
        if (found) return (cachedListId = found.id);
        if (lists.length < 50) break;
    }

    const { folders = [] } = await brevo('/contacts/folders?limit=50&offset=0');
    const folder = folders.find(f => /marcos/i.test(f.name)) || folders[0];
    const folderId = folder ? folder.id : (await brevo('/contacts/folders', { method: 'POST', body: { name: 'MarcosLacayoBosche' } })).id;
    const created = await brevo('/contacts/lists', { method: 'POST', body: { name: SIGNUP_LIST_NAME, folderId } });
    return (cachedListId = created.id);
}

/**
 * Add or update a sign-up in Brevo.
 * @param {{email:string, firstName?:string, source?:string, utmSource?:string}} p
 */
export async function addSignupContact({ email, firstName, source, utmSource }) {
    const listIds = [await signupListId()];
    const sourceLabel = [source || 'website', utmSource].filter(Boolean).join(' · ');
    const attributes = { SOURCE: sourceLabel };
    if (firstName) attributes.FIRSTNAME = firstName;

    try {
        await brevo('/contacts', { method: 'POST', body: { email, attributes, listIds, updateEnabled: true } });
    } catch (e) {
        // An attribute Brevo doesn't know shouldn't lose the sign-up
        if (e.status !== 400) throw e;
        console.warn('Brevo rejected attributes, retrying without them:', e.message);
        await brevo('/contacts', { method: 'POST', body: { email, listIds, updateEnabled: true } });
    }
    return { ok: true };
}
