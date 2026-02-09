export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'Brevo API key not configured' });
    }

    const { title, content, excerpt, listIds, blogUrl } = req.body;

    if (!title || !content || !listIds || listIds.length === 0) {
        return res.status(400).json({ error: 'title, content, and listIds are required' });
    }

    try {
        // Create and send a Brevo email campaign
        const campaignRes = await fetch('https://api.brevo.com/v3/emailCampaigns', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'content-type': 'application/json',
                'api-key': apiKey
            },
            body: JSON.stringify({
                name: `Blog: ${title} - ${new Date().toISOString().slice(0, 10)}`,
                subject: title,
                sender: {
                    name: 'Marcos Bosche',
                    email: 'marcos@marcoslacayobosche.com'
                },
                replyTo: {
                    name: 'Marcos Bosche',
                    email: 'marcos.bosche@nymbl.app'
                },
                type: 'classic',
                htmlContent: buildEmailHtml(title, content, excerpt, blogUrl),
                recipients: {
                    listIds: listIds.map(Number)
                }
            })
        });

        const campaignData = await campaignRes.json();

        if (!campaignRes.ok) {
            throw new Error(campaignData.message || 'Failed to create campaign');
        }

        // Send the campaign immediately
        const sendRes = await fetch(`https://api.brevo.com/v3/emailCampaigns/${campaignData.id}/sendNow`, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': apiKey
            }
        });

        if (!sendRes.ok) {
            const sendData = await sendRes.json();
            throw new Error(sendData.message || 'Failed to send campaign');
        }

        return res.status(200).json({ success: true, campaignId: campaignData.id });
    } catch (error) {
        console.error('Blog email error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send blog email' });
    }
}

function buildEmailHtml(title, content, excerpt, blogUrl) {
    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
        <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <p style="color: #7c3aed; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 16px;">New from Marcos Bosche</p>
            
            <h1 style="font-size: 24px; line-height: 1.3; color: #0f172a; margin: 0 0 16px;">${title}</h1>
            
            ${excerpt ? `<p style="font-size: 16px; color: #64748b; line-height: 1.6; margin: 0 0 24px;">${excerpt}</p>` : ''}
            
            <div style="font-size: 16px; line-height: 1.8; color: #1e293b;">
                ${content}
            </div>

            ${blogUrl ? `
                <div style="text-align: center; margin-top: 32px;">
                    <a href="${blogUrl}" style="display: inline-block; background: #7c3aed; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600;">Read on Website →</a>
                </div>
            ` : ''}
        </div>
        
        <div style="text-align: center; padding: 24px; color: #94a3b8; font-size: 13px;">
            <p>Marcos Bosche | AI Transformation Consultant</p>
            <p><a href="https://marcoslacayobosche.com" style="color: #7c3aed;">marcoslacayobosche.com</a></p>
        </div>
    </div>
</body>
</html>`;
}
