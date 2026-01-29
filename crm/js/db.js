// ==========================================================================
// CRM Database Client (Supabase)
// ==========================================================================

class CRMDB {
    constructor() {
        const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.CRM_CONFIG;
        this.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // ==========================================================================
    // Contacts
    // ==========================================================================

    /**
     * Get all contacts with optional filters
     */
    async getContacts(filters = {}) {
        let query = this.supabase
            .from('contacts')
            .select(`
                *,
                companies (
                    id,
                    name,
                    industry
                )
            `)
            .order('created_at', { ascending: false });

        // Apply filters
        if (filters.source) {
            query = query.eq('source', filters.source);
        }
        if (filters.status) {
            query = query.eq('status', filters.status);
        }
        if (filters.search) {
            query = query.or(`first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching contacts:', error);
            throw error;
        }

        return data || [];
    }

    /**
     * Get single contact by ID
     */
    async getContact(id) {
        const { data, error } = await this.supabase
            .from('contacts')
            .select(`
                *,
                companies (
                    id,
                    name,
                    industry
                )
            `)
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching contact:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get today's actions for dashboard
     */
    async getTodaysActions() {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await this.supabase
            .from('contacts')
            .select(`
                *,
                companies (
                    id,
                    name
                )
            `)
            .not('next_action', 'is', null)
            .not('next_action', 'eq', 'None')
            .lte('next_action_date', today)
            .order('next_action_date', { ascending: true });

        if (error) {
            console.error('Error fetching today\'s actions:', error);
            throw error;
        }

        // Group by action type and overdue status
        const result = {
            calls: [],
            emails: [],
            followUps: [],
            overdue: [],
            newToday: []
        };

        const todayDate = new Date().toISOString().split('T')[0];

        for (const contact of (data || [])) {
            const isOverdue = contact.next_action_date < todayDate;

            if (isOverdue) {
                result.overdue.push(contact);
            } else if (contact.next_action === 'Call') {
                result.calls.push(contact);
            } else if (contact.next_action === 'Email') {
                result.emails.push(contact);
            } else if (contact.next_action === 'Follow Up') {
                result.followUps.push(contact);
            }
        }

        // Get new contacts added today
        const { data: newData } = await this.supabase
            .from('contacts')
            .select('*, companies(name)')
            .gte('created_at', todayDate)
            .order('created_at', { ascending: false });

        result.newToday = newData || [];

        return result;
    }

    /**
     * Create new contact
     */
    async createContact(contactData) {
        // Set defaults based on source
        const source = contactData.source;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const fiveDaysLater = new Date();
        fiveDaysLater.setDate(fiveDaysLater.getDate() + 5);

        const defaults = {
            status: 'New',
            next_action: 'Call',
            next_action_date: source === 'Clay Import'
                ? fiveDaysLater.toISOString().split('T')[0]
                : tomorrow.toISOString().split('T')[0],
            brevo_tag: window.CRM_CONFIG.BREVO_TAGS[source] || 'other-lead',
            brevo_synced: false
        };

        const contact = { ...defaults, ...contactData };

        const { data, error } = await this.supabase
            .from('contacts')
            .insert([contact])
            .select()
            .single();

        if (error) {
            console.error('Error creating contact:', error);
            throw error;
        }

        // Auto-sync to Brevo
        this.syncToBrevo(data).catch(e => console.log('Brevo sync failed (will retry):', e));

        return data;
    }

    /**
     * Sync contact to Brevo
     */
    async syncToBrevo(contact) {
        try {
            const response = await fetch('/api/brevo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'sync',
                    contact: {
                        email: contact.email,
                        firstName: contact.first_name,
                        lastName: contact.last_name,
                        company: contact.companies?.name || '',
                        source: contact.source,
                        tag: contact.brevo_tag,
                        problem: contact.problem
                    }
                })
            });

            if (response.ok) {
                // Mark as synced in database
                await this.supabase
                    .from('contacts')
                    .update({ brevo_synced: true })
                    .eq('id', contact.id);
                console.log('✅ Contact synced to Brevo:', contact.email);
                return true;
            } else {
                // Log the error response for debugging
                const errorData = await response.json().catch(() => ({}));
                console.error('❌ Brevo sync failed for', contact.email, ':', errorData.error || response.status);
                return false;
            }
        } catch (error) {
            console.error('Brevo sync error:', error);
            return false;
        }
    }

    /**
     * Sync all unsynced contacts to Brevo
     */
    async syncAllToBrevo() {
        // Get all unsynced contacts
        const { data: contacts, error } = await this.supabase
            .from('contacts')
            .select('*, companies(name)')
            .eq('brevo_synced', false);

        if (error || !contacts) {
            console.error('Error fetching unsynced contacts:', error);
            return { synced: 0, failed: 0, total: 0 };
        }

        let synced = 0;
        let failed = 0;

        for (const contact of contacts) {
            const success = await this.syncToBrevo(contact);
            if (success) {
                synced++;
            } else {
                failed++;
            }
            // Small delay to avoid rate limiting
            await new Promise(r => setTimeout(r, 200));
        }

        return { synced, failed, total: contacts.length };
    }

    /**
     * Update contact
     */
    async updateContact(id, updates) {
        const { data, error } = await this.supabase
            .from('contacts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating contact:', error);
            throw error;
        }

        return data;
    }

    /**
     * Mark action as done
     */
    async markActionDone(id, note = '') {
        const contact = await this.getContact(id);

        // Add dated note
        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const actionNote = `${dateStr}: Completed ${contact.next_action}. ${note}`;
        const existingNotes = contact.notes || '';
        const newNotes = existingNotes ? `${actionNote}\n\n${existingNotes}` : actionNote;

        const { data, error } = await this.supabase
            .from('contacts')
            .update({
                next_action: null,
                next_action_date: null,
                notes: newNotes
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error marking action done:', error);
            throw error;
        }

        return data;
    }

    /**
     * Snooze action to new date
     */
    async snoozeAction(id, daysFromNow) {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + daysFromNow);

        const { data, error } = await this.supabase
            .from('contacts')
            .update({
                next_action_date: newDate.toISOString().split('T')[0]
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error snoozing action:', error);
            throw error;
        }

        return data;
    }

    /**
     * Add note to contact
     */
    async addNote(id, noteText) {
        const contact = await this.getContact(id);

        const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const newNote = `${dateStr}: ${noteText}`;
        const existingNotes = contact.notes || '';
        const updatedNotes = existingNotes ? `${newNote}\n\n${existingNotes}` : newNote;

        return this.updateContact(id, { notes: updatedNotes });
    }

    // ==========================================================================
    // Companies (for autocomplete)
    // ==========================================================================

    /**
     * Find or create company
     */
    async findOrCreateCompany(name) {
        if (!name) return null;

        // Try to find existing company
        const { data: existing } = await this.supabase
            .from('companies')
            .select('id')
            .ilike('name', name)
            .single();

        if (existing) return existing.id;

        // Create new company
        const { data: newCompany, error } = await this.supabase
            .from('companies')
            .insert([{ name, status: 'Prospect' }])
            .select()
            .single();

        if (error) {
            console.error('Error creating company:', error);
            return null;
        }

        return newCompany.id;
    }

    // ==========================================================================
    // Activities (Interaction History)
    // ==========================================================================

    /**
     * Log an activity for a contact
     */
    async logActivity(contactId, activity) {
        const { data, error } = await this.supabase
            .from('activities')
            .insert([{
                contact_id: contactId,
                activity_type: activity.type,
                outcome: activity.outcome || null,
                notes: activity.notes || null
            }])
            .select()
            .single();

        if (error) {
            console.error('Error logging activity:', error);
            throw error;
        }

        return data;
    }

    /**
     * Get all activities for a contact (timeline)
     */
    async getActivities(contactId) {
        const { data, error } = await this.supabase
            .from('activities')
            .select('*')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching activities:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Log action completion with outcome and set next action
     */
    async completeAction(contactId, outcome, notes, nextAction, nextActionDate) {
        const contact = await this.getContact(contactId);

        // Log the activity
        await this.logActivity(contactId, {
            type: contact.next_action?.toLowerCase() || 'note',
            outcome: outcome,
            notes: notes
        });

        // Update contact with next action
        const updates = {
            next_action: nextAction || 'None',
            next_action_date: nextActionDate || null
        };

        // If outcome indicates won/lost, update status
        if (outcome === 'not_interested') {
            updates.status = 'Lost';
        } else if (outcome === 'scheduled_meeting') {
            updates.status = 'Active';
        }

        return this.updateContact(contactId, updates);
    }
}

// Create global instance
window.crmDB = new CRMDB();
