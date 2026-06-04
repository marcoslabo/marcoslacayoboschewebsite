// ==========================================================================
// GET /api/npi-search?q=...
// Proxies the public CMS NPI Registry API (no key required) for typeahead.
// Returns a slim, UI-friendly array of matches.
// ==========================================================================

const NPI_API = 'https://npiregistry.cms.hhs.gov/api/';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const q = (req.query.q || '').trim();
    if (q.length < 3) {
        return res.status(200).json({ results: [] });
    }

    // NPI Registry supports trailing-wildcard search on org name + last name.
    // We query both org names and individual provider last names to cover groups + solo.
    const params = new URLSearchParams({
        version: '2.1',
        limit: '10',
        country_code: 'US',
        organization_name: `${q}*`
    });

    try {
        const upstream = await fetch(`${NPI_API}?${params.toString()}`);
        if (!upstream.ok) {
            return res.status(upstream.status).json({ error: 'NPI Registry error', results: [] });
        }
        const data = await upstream.json();
        const results = (data.results || []).map(slim);

        // If we got nothing on org name, try last name as fallback (solo providers)
        if (results.length === 0 && /^[a-z\s]+$/i.test(q)) {
            const altParams = new URLSearchParams({
                version: '2.1',
                limit: '10',
                country_code: 'US',
                last_name: `${q}*`
            });
            const alt = await fetch(`${NPI_API}?${altParams.toString()}`);
            if (alt.ok) {
                const altData = await alt.json();
                return res.status(200).json({ results: (altData.results || []).map(slim) });
            }
        }

        return res.status(200).json({ results });
    } catch (e) {
        console.error('NPI search error:', e);
        return res.status(500).json({ error: 'NPI search failed', results: [] });
    }
}

function slim(r) {
    const basic = r.basic || {};
    const addr = (r.addresses || []).find(a => a.address_purpose === 'LOCATION') || (r.addresses || [])[0] || {};
    const taxonomy = (r.taxonomies || []).find(t => t.primary) || (r.taxonomies || [])[0] || {};
    const isOrg = r.enumeration_type === 'NPI-2';
    return {
        npi: r.number,
        type: isOrg ? 'organization' : 'individual',
        name: isOrg
            ? (basic.organization_name || basic.name)
            : `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
        specialty: taxonomy.desc || null,
        city: addr.city || null,
        state: addr.state || null,
        postal_code: addr.postal_code || null,
        taxonomies: (r.taxonomies || []).map(t => t.desc).filter(Boolean)
    };
}
