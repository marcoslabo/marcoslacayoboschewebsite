// ==========================================================================
// Supabase Client for Spark
// ==========================================================================

class SparkDatabase {
    constructor() {
        this.client = null;
        this.initialized = false;
    }

    /**
     * Initialize Supabase client
     */
    init() {
        if (this.initialized) return;

        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.SPARK_CONFIG;

        if (!SUPABASE_URL || SUPABASE_URL === 'YOUR_SUPABASE_URL') {
            console.warn('Supabase not configured. Running in demo mode.');
            this.demoMode = true;
            this.initialized = true;
            return;
        }

        this.client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.initialized = true;
        console.log('Supabase client initialized');
    }

    // ==========================================================================
    // Companies
    // ==========================================================================

    async getCompanies() {
        if (this.demoMode) return this.getDemoCompanies();

        const { data, error } = await this.client
            .from('companies')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async getCompany(id) {
        if (this.demoMode) return this.getDemoCompany(id);

        const { data, error } = await this.client
            .from('companies')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async createCompany(company) {
        if (this.demoMode) return this.createDemoCompany(company);

        const { data, error } = await this.client
            .from('companies')
            .insert([company])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ==========================================================================
    // Contacts
    // ==========================================================================

    async getContacts() {
        if (this.demoMode) return this.getDemoContacts();

        const { data, error } = await this.client
            .from('contacts')
            .select(`
                *,
                company:companies(id, name)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async createContact(contact) {
        if (this.demoMode) return this.createDemoContact(contact);

        const { data, error } = await this.client
            .from('contacts')
            .insert([contact])
            .select()
            .single();

        if (error) throw error;
        return data;
    }

    // ==========================================================================
    // Briefs
    // ==========================================================================

    async getBriefs() {
        if (this.demoMode) return this.getDemoBriefs();

        const { data, error } = await this.client
            .from('briefs_with_roi')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data;
    }

    async getBrief(id) {
        if (this.demoMode) return this.getDemoBrief(id);

        const { data, error } = await this.client
            .from('briefs_with_roi')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;
        return data;
    }

    async getBriefByShareId(shareId) {
        if (this.demoMode) return this.getDemoBriefByShareId(shareId);

        const { data, error } = await this.client
            .from('briefs_with_roi')
            .select('*')
            .eq('share_id', shareId)
            .single();

        if (error) throw error;
        return data;
    }

    async createBrief(brief) {
        if (this.demoMode) return this.createDemoBrief(brief);

        // Generate share_id
        brief.share_id = this.generateShareId();

        const { data, error } = await this.client
            .from('briefs')
            .insert([brief])
            .select()
            .single();

        if (error) throw error;

        // Log activity
        await this.logActivity(data.id, 'Created', 'Brief created');

        return data;
    }

    async updateBrief(id, updates) {
        if (this.demoMode) return this.updateDemoBrief(id, updates);

        const { data, error } = await this.client
            .from('briefs')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        // Log activity
        await this.logActivity(id, 'Edited', 'Brief updated');

        return data;
    }

    async incrementBriefViews(shareId) {
        if (this.demoMode) return;

        const { data: brief } = await this.client
            .from('briefs')
            .select('id, share_link_views')
            .eq('share_id', shareId)
            .single();

        if (brief) {
            await this.client
                .from('briefs')
                .update({ share_link_views: (brief.share_link_views || 0) + 1 })
                .eq('id', brief.id);

            await this.logActivity(brief.id, 'Link Viewed', 'Shared brief viewed');
        }
    }

    // ==========================================================================
    // Activity Log
    // ==========================================================================

    async logActivity(briefId, activityType, details) {
        if (this.demoMode) return;

        const { error } = await this.client
            .from('activity_log')
            .insert([{
                brief_id: briefId,
                activity_type: activityType,
                details: details
            }]);

        if (error) console.error('Failed to log activity:', error);
    }

    // ==========================================================================
    // Stats
    // ==========================================================================

    async getStats() {
        if (this.demoMode) return this.getDemoStats();

        const briefs = await this.getBriefs();

        return {
            totalBriefs: briefs.length,
            sharedBriefs: briefs.filter(b => b.status === 'Shared' || b.share_link_views > 0).length,
            totalPotentialROI: briefs.reduce((sum, b) => sum + (b.annual_potential_savings || 0), 0)
        };
    }

    // ==========================================================================
    // Utilities
    // ==========================================================================

    generateShareId() {
        return Math.random().toString(36).substring(2, 10);
    }

    // ==========================================================================
    // Demo Mode Data
    // ==========================================================================

    getDemoCompanies() {
        return [
            { id: 'demo-1', name: 'Regional Radiology Network', industry: 'Healthcare', company_size: '201-500', status: 'Prospect' },
            { id: 'demo-2', name: 'Austin Manufacturing Co', industry: 'Manufacturing', company_size: '51-200', status: 'Prospect' }
        ];
    }

    getDemoCompany(id) {
        return this.getDemoCompanies().find(c => c.id === id);
    }

    createDemoCompany(company) {
        return { ...company, id: 'demo-' + Date.now() };
    }

    getDemoContacts() {
        return [
            { id: 'contact-1', first_name: 'Sarah', last_name: 'Chen', email: 'sarah@example.com', job_title: 'VP Operations', company_id: 'demo-1', company: { id: 'demo-1', name: 'Regional Radiology Network' } },
            { id: 'contact-2', first_name: 'Mike', last_name: 'Rodriguez', email: 'mike@example.com', job_title: 'COO', company_id: 'demo-2', company: { id: 'demo-2', name: 'Austin Manufacturing Co' } }
        ];
    }

    createDemoContact(contact) {
        return { ...contact, id: 'contact-' + Date.now() };
    }

    getDemoBriefs() {
        return [
            {
                id: 'brief-1',
                title: 'Fax Processing Automation',
                company_id: 'demo-1',
                company_name: 'Regional Radiology Network',
                company_industry: 'Healthcare',
                contact_name: 'Sarah Chen',
                contact_email: 'sarah@example.com',
                problem_raw: 'faxes everywhere, nurses typing into epic all day',
                problem_clean: 'The organization receives thousands of inbound faxes daily containing clinical orders. Staff must manually enter this data into the Epic EMR system.',
                current_process: 'Nurses manually type fax data into Epic',
                hours_per_week: 120,
                people_involved: 6,
                hourly_rate: 45,
                improvement_percent: 90,
                annual_current_cost: 280800,
                annual_potential_savings: 252720,
                solution_level: 'Level 3 - Custom Development',
                level_reasoning: 'Requires OCR, HL7 integration, and custom AI pipeline',
                suggested_approach: 'We would implement an AI-powered intelligent document processing system using OCR and machine learning.',
                status: 'Draft',
                share_id: 'abc12345',
                share_link_views: 0,
                created_at: new Date().toISOString()
            },
            {
                id: 'brief-2',
                title: 'Inventory Management Consolidation',
                company_id: 'demo-2',
                company_name: 'Austin Manufacturing Co',
                company_industry: 'Manufacturing',
                contact_name: 'Mike Rodriguez',
                contact_email: 'mike@example.com',
                problem_raw: 'spreadsheets everywhere for inventory',
                problem_clean: 'Inventory management relies on disconnected spreadsheets maintained by multiple team members.',
                current_process: 'Multiple Excel files shared via email',
                hours_per_week: 25,
                people_involved: 4,
                hourly_rate: 40,
                improvement_percent: 75,
                annual_current_cost: 208000,
                annual_potential_savings: 156000,
                solution_level: 'Level 2 - Workflow Integration',
                level_reasoning: 'Can be solved with automation tools connecting existing systems',
                suggested_approach: 'We would consolidate inventory data into a unified system with automated syncing.',
                status: 'Shared',
                share_id: 'xyz98765',
                share_link_views: 3,
                created_at: new Date(Date.now() - 86400000).toISOString()
            }
        ];
    }

    getDemoBrief(id) {
        return this.getDemoBriefs().find(b => b.id === id);
    }

    getDemoBriefByShareId(shareId) {
        return this.getDemoBriefs().find(b => b.share_id === shareId);
    }

    createDemoBrief(brief) {
        const id = 'brief-' + Date.now();
        const shareId = this.generateShareId();
        return {
            ...brief,
            id,
            share_id: shareId,
            share_link_views: 0,
            created_at: new Date().toISOString(),
            annual_current_cost: (brief.hours_per_week || 0) * (brief.people_involved || 1) * (brief.hourly_rate || 50) * 52,
            annual_potential_savings: (brief.hours_per_week || 0) * (brief.people_involved || 1) * (brief.hourly_rate || 50) * 52 * ((brief.improvement_percent || 80) / 100)
        };
    }

    updateDemoBrief(id, updates) {
        const brief = this.getDemoBrief(id);
        return { ...brief, ...updates };
    }

    getDemoStats() {
        const briefs = this.getDemoBriefs();
        return {
            totalBriefs: briefs.length,
            sharedBriefs: briefs.filter(b => b.status === 'Shared' || b.share_link_views > 0).length,
            totalPotentialROI: briefs.reduce((sum, b) => sum + (b.annual_potential_savings || 0), 0)
        };
    }
}

// Create global instance
window.sparkDB = new SparkDatabase();
