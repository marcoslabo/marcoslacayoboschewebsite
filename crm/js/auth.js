// ==========================================================================
// CRM Authentication
// ==========================================================================

class CRMAuth {
    constructor() {
        this.sessionKey = window.CRM_CONFIG.SESSION_KEY;
        this.roleKey = 'crm_user_role';
        this.ownerKey = 'crm_user_owner';
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn() {
        const token = localStorage.getItem(this.sessionKey);
        return token && token.startsWith('crm_');
    }

    /**
     * Get current user role ('admin' or 'team')
     */
    getRole() {
        return localStorage.getItem(this.roleKey) || 'team';
    }

    /**
     * Check if current user is admin
     */
    isAdmin() {
        return this.getRole() === 'admin';
    }

    /**
     * Get current owner identifier (e.g. 'marcos', 'joy')
     */
    getOwner() {
        return localStorage.getItem(this.ownerKey) || 'marcos';
    }

    /**
     * Get current session token
     */
    getToken() {
        return localStorage.getItem(this.sessionKey);
    }

    /**
     * Attempt login with password
     */
    async login(password) {
        try {
            const response = await fetch('/api/crm-auth', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ password })
            });

            const data = await response.json();

            if (data.success && data.token) {
                localStorage.setItem(this.sessionKey, data.token);
                localStorage.setItem(this.roleKey, data.role || 'admin');
                localStorage.setItem(this.ownerKey, data.owner || 'marcos');
                return { success: true };
            }

            return { success: false, error: data.error || 'Login failed' };
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: 'Connection error. Please try again.' };
        }
    }

    /**
     * Logout
     */
    logout() {
        localStorage.removeItem(this.sessionKey);
        localStorage.removeItem(this.roleKey);
        localStorage.removeItem(this.ownerKey);
    }
}

// Create global instance
window.crmAuth = new CRMAuth();
