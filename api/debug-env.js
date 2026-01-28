export default async function handler(req, res) {
    const hasBrevoKey = !!process.env.BREVO_API_KEY;
    const keyPrefix = hasBrevoKey ? process.env.BREVO_API_KEY.substring(0, 10) + '...' : 'NOT SET';

    return res.status(200).json({
        status: 'ok',
        brevo_key_configured: hasBrevoKey,
        key_prefix: keyPrefix,
        openai_configured: !!process.env.OPENAI_API_KEY,
        crm_password_configured: !!process.env.CRM_PASSWORD
    });
}
