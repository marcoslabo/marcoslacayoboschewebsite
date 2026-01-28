export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password } = req.body;
    const correctPassword = process.env.CRM_PASSWORD;

    if (!correctPassword) {
        return res.status(500).json({ error: 'CRM password not configured' });
    }

    if (password === correctPassword) {
        // Generate a simple session token (timestamp + random)
        const token = `crm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        return res.status(200).json({
            success: true,
            token,
            message: 'Login successful'
        });
    }

    return res.status(401).json({
        success: false,
        error: 'Invalid password'
    });
}
