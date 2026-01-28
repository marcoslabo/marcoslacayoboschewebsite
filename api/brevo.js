export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.BREVO_API_KEY;

    if (!apiKey) {
        console.error('BREVO_API_KEY not found in environment');
        return res.status(500).json({ error: 'Brevo API key not configured' });
    }

    const { action, contact } = req.body;

    // Validate contact data
    if (!contact || !contact.email) {
        return res.status(400).json({ error: 'Email is required' });
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contact.email)) {
        return res.status(400).json({ error: 'Invalid email format: ' + contact.email });
    }

    try {
        if (action === 'sync') {
            // Create or update contact in Brevo
            const result = await syncContact(apiKey, contact);
            return res.status(200).json({ success: true, result });
        } else if (action === 'addToList') {
            // Add contact to a specific list
            const result = await addToList(apiKey, contact.email, contact.listId);
            return res.status(200).json({ success: true, result });
        } else {
            return res.status(400).json({ error: 'Invalid action' });
        }
    } catch (error) {
        console.error('Brevo API error:', error.message, 'for email:', contact.email);
        return res.status(500).json({
            error: error.message || 'Brevo sync failed',
            email: contact.email
        });
    }
}

/**
 * Sync a contact to Brevo (create or update)
 */
async function syncContact(apiKey, contact) {
    const { email, firstName, lastName, company, source, tag, problem } = contact;

    // Build attributes
    const attributes = {
        FIRSTNAME: firstName || '',
        LASTNAME: lastName || '',
        COMPANY: company || '',
        SOURCE: source || '',
        CRM_PROBLEM: problem || ''
    };

    // Create contact payload
    const payload = {
        email: email,
        attributes: attributes,
        updateEnabled: true // Update if exists
    };

    // Add list IDs based on tag (from user's Brevo Spark CRM folder)
    const listMap = {
        'met-lead': 7,         // MeetinPerson#1
        'direct-lead': 8,      // Directcall#2
        'linkedin-lead': 9,    // LinkedinSM#3
        'referral-lead': 10,   // ReferralImport#4
        'spark-lead': 3,       // Spark leads (original list)
        'event-lead': 7,       // Events go to Met In Person
        'clay-lead': 10,       // Clay imports go to Referral
        'other-lead': 7        // Default to Met In Person
    };

    // Always add to a list - default to Met In Person (7) if no tag match
    const listId = (tag && listMap[tag]) ? listMap[tag] : 7;
    payload.listIds = [listId];

    const response = await fetch('https://api.brevo.com/v3/contacts', {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Brevo error: ${response.status}`);
    }

    return await response.json();
}

/**
 * Add contact to a specific Brevo list
 */
async function addToList(apiKey, email, listId) {
    const response = await fetch(`https://api.brevo.com/v3/contacts/lists/${listId}/contacts/add`, {
        method: 'POST',
        headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'api-key': apiKey
        },
        body: JSON.stringify({
            emails: [email]
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Brevo error: ${response.status}`);
    }

    return await response.json();
}
