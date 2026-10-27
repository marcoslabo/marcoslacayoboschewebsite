// ==========================================================================
// CRM Authentication (Supabase Auth)
// Signing in gives the browser a Supabase session; the database only lets
// signed-in CRM users (the crm_users table) read or change CRM data.
// ==========================================================================

class CRMAuth {
    constructor() {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CRM_CONFIG;
        // One client for the whole CRM, so every query carries the session
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.crmSupabase = this.supabase;
        this.session = null;
        this.profile = null;
    }

    /**
     * Restore a saved session (if any) and load the user's CRM profile.
     * Call once on page load before rendering anything.
     */
    async restore() {
        const { data } = await this.supabase.auth.getSession();
        this.session = data.session;
        if (!this.session) return false;

        const ok = await this.loadProfile();
        if (!ok) await this.logout();
        return ok;
    }

    async loadProfile() {
        const { data, error } = await this.supabase
            .from('crm_users')
            .select('email, role, owner')
            .maybeSingle();
        this.profile = error ? null : data;
        return !!this.profile;
    }

    /**
     * Check if user is logged in (after restore() or login())
     */
    isLoggedIn() {
        return !!(this.session && this.profile);
    }

    /**
     * Get current user role ('admin' or 'team')
     */
    getRole() {
        return this.profile?.role || 'team';
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
        return this.profile?.owner || 'marcos';
    }

    /**
     * Headers for CRM-only /api endpoints
     */
    async authHeaders() {
        const { data } = await this.supabase.auth.getSession();
        const token = data.session?.access_token;
        return token
            ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
            : { 'Content-Type': 'application/json' };
    }

    /**
     * Sign in with email + password
     */
    async login(email, password) {
        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: email.trim().toLowerCase(),
            password
        });

        if (error) {
            return { success: false, error: error.message === 'Invalid login credentials' ? 'Wrong email or password' : error.message };
        }

        this.session = data.session;
        if (!(await this.loadProfile())) {
            await this.logout();
            return { success: false, error: 'This account does not have CRM access' };
        }
        return { success: true };
    }

    /**
     * Logout
     */
    async logout() {
        await this.supabase.auth.signOut();
        this.session = null;
        this.profile = null;
    }
}

// Create global instance
window.crmAuth = new CRMAuth();
