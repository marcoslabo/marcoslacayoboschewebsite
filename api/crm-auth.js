export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { email, password } = req.body;
    const adminPassword = process.env.CRM_PASSWORD;
    const teamPassword = process.env.CRM_TEAM_PASSWORD;

    if (!adminPassword) {
        return res.status(500).json({ error: 'CRM password not configured' });
    }

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
    }

    // Define users: email → { password env var, role, owner }
    const users = {
        'marcos@marcoslacayobosche.com': {
            password: adminPassword,
            role: 'admin',
            owner: 'marcos'
        },
        'joy@nymbl.app': {
            password: teamPassword,
            role: 'team',
            owner: 'joy'
        },
        'kevin.slayden@nymbl.app': {
            password: teamPassword,
            role: 'team',
            owner: 'kevin'
        }
    };

    const normalizedEmail = email.toLowerCase().trim();
    const user = users[normalizedEmail];

    if (!user) {
        return res.status(401).json({ success: false, error: 'Email not recognized' });
    }

    if (!user.password || password !== user.password) {
        return res.status(401).json({ success: false, error: 'Invalid password' });
    }

    const token = `crm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    return res.status(200).json({
        success: true,
        token,
        role: user.role,
        owner: user.owner,
        message: 'Login successful'
    });
}
