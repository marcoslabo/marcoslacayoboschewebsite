export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const { linkedinUrl, voiceText } = req.body;

    try {
        if (linkedinUrl) {
            // Extract contact info from LinkedIn URL using AI
            const result = await extractFromLinkedIn(apiKey, linkedinUrl);
            return res.status(200).json({ success: true, contact: result });
        } else if (voiceText) {
            // Parse voice dictation into contact fields
            const result = await parseVoiceInput(apiKey, voiceText);
            return res.status(200).json({ success: true, contact: result });
        } else {
            return res.status(400).json({ error: 'No input provided' });
        }
    } catch (error) {
        console.error('Contact extraction error:', error);
        return res.status(500).json({
            error: error.message || 'Extraction failed'
        });
    }
}

/**
 * Extract contact info from LinkedIn URL
 * Note: This uses AI to process the URL pattern - actual scraping would need a service
 */
async function extractFromLinkedIn(apiKey, url) {
    // Extract username from LinkedIn URL
    const match = url.match(/linkedin\.com\/in\/([^\/\?]+)/i);
    if (!match) {
        throw new Error('Invalid LinkedIn URL format');
    }

    const username = match[1].replace(/-/g, ' ');

    // Use AI to intelligently parse the username into name components
    const prompt = `Parse this LinkedIn username into a contact record. The username is: "${username}"
    
Many LinkedIn usernames follow patterns like:
- firstname-lastname
- firstname-lastname-title
- firstname-middlename-lastname

Return ONLY valid JSON with these fields (use empty string if unknown):
{
  "first_name": "",
  "last_name": "",
  "linkedin_url": "${url}"
}`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        throw new Error('AI extraction failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Could not parse AI response');
    }

    return JSON.parse(jsonMatch[0]);
}

/**
 * Parse voice dictation into contact fields
 */
async function parseVoiceInput(apiKey, voiceText) {
    const prompt = `Parse this voice dictation into a contact record:

"${voiceText}"

Extract any mentioned information and return ONLY valid JSON with these fields (use empty string if not mentioned):
{
  "first_name": "",
  "last_name": "",
  "email": "",
  "phone": "",
  "company": "",
  "job_title": "",
  "industry": "",
  "problem": "",
  "source": ""
}

For source, use one of: "Met In Person", "LinkedIn", "Direct Call", "Referral", "Event", or leave empty.
For industry, use one of: "Healthcare", "Manufacturing", "Technology", "Finance", "Retail", "Professional Services", or leave empty.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3
        })
    });

    if (!response.ok) {
        throw new Error('AI parsing failed');
    }

    const data = await response.json();
    const content = data.choices[0].message.content.trim();

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Could not parse AI response');
    }

    return JSON.parse(jsonMatch[0]);
}
