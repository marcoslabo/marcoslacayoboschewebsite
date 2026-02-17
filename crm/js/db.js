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
     * Get unique event tags for dropdown
     */
    async getEventTags() {
        const { data, error } = await this.supabase
            .from('contacts')
            .select('event_tag')
            .not('event_tag', 'is', null);

        if (error) {
            console.error('Error fetching event tags:', error);
            return [];
        }

        // Get unique non-null tags
        const uniqueTags = [...new Set(data.map(c => c.event_tag).filter(Boolean))];
        return uniqueTags.sort();
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
    async createContact(contactData, options = {}) {
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

        // Brevo sync is now MANUAL ONLY — no auto-sync on create
        // Use pushToBrevo() to explicitly push a contact to a specific list

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
                        problem: contact.problem,
                        eventTag: contact.event_tag  // Used to assign to Brevo list
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
     * Delete contact
     */
    async deleteContact(id) {
        // First delete related activities
        await this.supabase
            .from('activities')
            .delete()
            .eq('contact_id', id);

        // Then delete the contact
        const { error } = await this.supabase
            .from('contacts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting contact:', error);
            throw error;
        }

        return true;
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

        // Trim and clean the name
        const cleanName = name.trim();
        if (!cleanName) return null;

        // Try to find existing company (case-insensitive)
        const { data: existing, error: findError } = await this.supabase
            .from('companies')
            .select('id')
            .eq('name', cleanName)
            .maybeSingle();

        if (findError) {
            console.warn('Company lookup error:', findError);
        }

        if (existing) return existing.id;

        // Create new company
        const { data: newCompany, error } = await this.supabase
            .from('companies')
            .insert([{ name: cleanName, status: 'Prospect' }])
            .select()
            .single();

        if (error) {
            // Might be a unique constraint violation - try to fetch again
            if (error.code === '23505') {
                const { data: retry } = await this.supabase
                    .from('companies')
                    .select('id')
                    .eq('name', cleanName)
                    .maybeSingle();
                return retry?.id || null;
            }
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
     * Get notes for a contact (from notes table - used by VoiceToCRM iOS app)
     */
    async getNotesForContact(contactId) {
        const { data, error } = await this.supabase
            .from('notes')
            .select('*')
            .eq('contact_id', contactId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching notes:', error);
            return [];
        }

        return data || [];
    }

    /**
     * Log action completion with outcome and set next action
     */
    async completeAction(contactId, outcome, notes, nextAction, nextActionDate) {
        const contact = await this.getContact(contactId);

        // Normalize activity type to match database constraint
        const rawType = (contact.next_action || 'note').toLowerCase();
        const typeMap = {
            'call': 'call',
            'email': 'email',
            'linkedin': 'linkedin',
            'follow up': 'note',  // Follow up logs as note
            'meeting': 'meeting',
            'none': 'note'
        };
        const activityType = typeMap[rawType] || 'note';

        // Log the activity
        await this.logActivity(contactId, {
            type: activityType,
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
    /**
     * Get all activities across all contacts, with optional date range filter
     * Returns activities joined with contact name/company
     */
    async getAllActivities(dateFrom = null, dateTo = null) {
        try {
            let query = this.supabase
                .from('activities')
                .select(`
                    *,
                    contacts:contact_id (
                        id,
                        name,
                        company
                    )
                `)
                .order('created_at', { ascending: false });

            if (dateFrom) {
                query = query.gte('created_at', dateFrom);
            }
            if (dateTo) {
                // Add 1 day to dateTo to include the full end date
                const endDate = new Date(dateTo);
                endDate.setDate(endDate.getDate() + 1);
                query = query.lt('created_at', endDate.toISOString().split('T')[0]);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Error fetching all activities:', error);
                throw new Error(error.message || 'Failed to fetch activities');
            }

            return (data || []).map(a => ({
                ...a,
                contact_name: a.contacts?.name || 'Unknown',
                contact_company: a.contacts?.company || '',
                contact_id: a.contact_id
            }));
        } catch (err) {
            console.error('getAllActivities error:', err);
            throw err;
        }
    }

    /**
     * Get dashboard stats (total leads, activity counts, outcomes)
     */
    async getDashboardStats() {
        // Get total contacts count
        const { count: totalContacts } = await this.supabase
            .from('contacts')
            .select('*', { count: 'exact', head: true });

        // Get contacts by status
        const { data: statusData } = await this.supabase
            .from('contacts')
            .select('status');

        const statusCounts = {};
        (statusData || []).forEach(c => {
            const status = c.status || 'New';
            statusCounts[status] = (statusCounts[status] || 0) + 1;
        });

        // Get all activities for outcome counting
        const { data: activities } = await this.supabase
            .from('activities')
            .select('activity_type, outcome, created_at');

        // Count activities by type
        const activityCounts = { call: 0, email: 0, meeting: 0, note: 0 };
        const outcomeCounts = {};

        (activities || []).forEach(a => {
            // Count by type
            const type = a.activity_type || 'note';
            activityCounts[type] = (activityCounts[type] || 0) + 1;

            // Count by outcome
            if (a.outcome) {
                outcomeCounts[a.outcome] = (outcomeCounts[a.outcome] || 0) + 1;
            }
        });

        return {
            totalContacts: totalContacts || 0,
            statusCounts,
            activityCounts,
            outcomeCounts,
            totalActivities: activities?.length || 0
        };
    }

    // ==========================================================================
    // Blog Post Functions
    // ==========================================================================

    /**
     * Get all blog posts (optionally filtered by status)
     */
    async getBlogPosts(status = null) {
        let query = this.supabase
            .from('blog_posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;
        if (error) {
            console.error('Error fetching blog posts:', error);
            return [];
        }
        return data || [];
    }

    /**
     * Get a single blog post by ID
     */
    async getBlogPost(id) {
        const { data, error } = await this.supabase
            .from('blog_posts')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching blog post:', error);
            throw error;
        }
        return data;
    }

    /**
     * Create a new blog post
     */
    async createBlogPost(postData) {
        // Auto-generate slug from title
        const slug = postData.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        const post = {
            title: postData.title,
            slug: slug,
            excerpt: postData.excerpt || '',
            content: postData.content,
            category: postData.category || 'ai-strategy',
            status: 'draft',
            author: 'Marcos Bosche',
            read_time: Math.max(1, Math.ceil((postData.content || '').split(/\s+/).length / 200))
        };

        const { data, error } = await this.supabase
            .from('blog_posts')
            .insert([post])
            .select()
            .single();

        if (error) {
            console.error('Error creating blog post:', error);
            throw error;
        }
        return data;
    }

    /**
     * Update a blog post
     */
    async updateBlogPost(id, updates) {
        updates.updated_at = new Date().toISOString();

        // Recalculate read time if content changed
        if (updates.content) {
            updates.read_time = Math.max(1, Math.ceil(updates.content.split(/\s+/).length / 200));
        }

        // Regenerate slug if title changed
        if (updates.title) {
            updates.slug = updates.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        }

        const { data, error } = await this.supabase
            .from('blog_posts')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating blog post:', error);
            throw error;
        }
        return data;
    }

    /**
     * Publish a blog post
     */
    async publishBlogPost(id) {
        return this.updateBlogPost(id, {
            status: 'published',
            published_at: new Date().toISOString()
        });
    }

    /**
     * Unpublish a blog post
     */
    async unpublishBlogPost(id) {
        return this.updateBlogPost(id, {
            status: 'draft',
            published_at: null
        });
    }

    /**
     * Delete a blog post
     */
    async deleteBlogPost(id) {
        const { error } = await this.supabase
            .from('blog_posts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting blog post:', error);
            throw error;
        }
        return true;
    }

    // ==========================================================================
    // Spark Brief Functions
    // ==========================================================================

    /**
     * Get all Spark briefs with ROI data
     */
    async getSparkBriefs() {
        const { data, error } = await this.supabase
            .from('briefs_with_roi')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching briefs:', error);
            // Fallback to briefs table if view doesn't exist
            const { data: fallback, error: fallbackError } = await this.supabase
                .from('briefs')
                .select('*')
                .order('created_at', { ascending: false });
            return fallback || [];
        }
        return data || [];
    }

    /**
     * Get a single Spark brief by ID
     */
    async getSparkBrief(id) {
        const { data, error } = await this.supabase
            .from('briefs_with_roi')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            // Fallback
            const { data: fallback } = await this.supabase
                .from('briefs')
                .select('*')
                .eq('id', id)
                .single();
            return fallback;
        }
        return data;
    }

    /**
     * Update a Spark brief status
     */
    async updateBriefStatus(id, status) {
        const { data, error } = await this.supabase
            .from('briefs')
            .update({ status })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating brief status:', error);
            throw error;
        }
        return data;
    }

    // ==========================================================================
    // Blog Image Upload
    // ==========================================================================

    /**
     * Compress an image file client-side using Canvas API
     * Returns a Blob of the compressed image
     */
    async compressImage(file, maxWidth = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const reader = new FileReader();

            reader.onload = (e) => {
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    // Only resize if larger than maxWidth
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }

                    canvas.width = width;
                    canvas.height = height;

                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    canvas.toBlob(
                        (blob) => {
                            if (blob) {
                                console.log(`📷 Compressed: ${(file.size / 1024).toFixed(0)}KB → ${(blob.size / 1024).toFixed(0)}KB (${width}x${height})`);
                                resolve(blob);
                            } else {
                                reject(new Error('Canvas compression failed'));
                            }
                        },
                        'image/jpeg',
                        quality
                    );
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Upload a blog image to Supabase Storage
     * Returns the public URL of the uploaded image
     */
    async uploadBlogImage(file) {
        // Compress the image first
        const compressed = await this.compressImage(file);

        // Generate unique filename
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.]/g, '_').toLowerCase();
        const fileName = `${timestamp}_${safeName.replace(/\.\w+$/, '')}.jpg`;

        // Upload to Supabase Storage
        const { data, error } = await this.supabase.storage
            .from('blog-images')
            .upload(fileName, compressed, {
                contentType: 'image/jpeg',
                cacheControl: '31536000' // Cache for 1 year
            });

        if (error) {
            console.error('Upload error:', error);
            throw new Error(error.message || 'Upload failed');
        }

        // Get public URL
        const { data: urlData } = this.supabase.storage
            .from('blog-images')
            .getPublicUrl(fileName);

        console.log('✅ Image uploaded:', urlData.publicUrl);
        return urlData.publicUrl;
    }
}

// Create global instance
window.crmDB = new CRMDB();
