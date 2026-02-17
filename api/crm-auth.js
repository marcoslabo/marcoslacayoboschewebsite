export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { password } = req.body;
    const adminPassword = process.env.CRM_PASSWORD;
    const teamPassword = process.env.CRM_TEAM_PASSWORD;

    if (!adminPassword) {
        return res.status(500).json({ error: 'CRM password not configured' });
    }

    // Admin login (Marcos) — full access
    if (password === adminPassword) {
        const token = `crm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return res.status(200).json({
            success: true,
            token,
            role: 'admin',
            owner: 'marcos',
            message: 'Login successful'
        });
    }

    // Team login (Joy) — contacts & activity only
    if (teamPassword && password === teamPassword) {
        const token = `crm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        return res.status(200).json({
            success: true,
            token,
            role: 'team',
            owner: 'joy',
            message: 'Login successful'
        });
    }

    return res.status(401).json({
        success: false,
        error: 'Invalid password'
    });
}
