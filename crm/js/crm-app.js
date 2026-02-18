// ==========================================================================
// CRM Main Application
// ==========================================================================

class CRMApp {
    constructor() {
        this.filters = {
            search: '',
            source: '',
            status: '',
            event_tag: ''
        };
        this.searchTimeout = null;
    }

    // ==========================================================================
    // Initialization
    // ==========================================================================

    async init() {
        // Check if logged in
        if (window.crmAuth.isLoggedIn()) {
            this.showApp();
            this.setupRoutes();
            this.setupEventListeners();
            window.crmRouter.start();
        } else {
            this.showLogin();
            this.setupLoginHandler();
        }
    }

    showLogin() {
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('app').style.display = 'none';
    }

    showApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'block';
        this.applyRoleVisibility();
    }

    /**
     * Hide/show UI elements based on user role
     */
    applyRoleVisibility() {
        const isAdmin = window.crmAuth.isAdmin();
        document.querySelectorAll('[data-admin-only]').forEach(el => {
            el.style.display = isAdmin ? '' : 'none';
        });
    }

    setupLoginHandler() {
        const form = document.getElementById('loginForm');
        const errorEl = document.getElementById('loginError');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('emailInput').value;
            const password = document.getElementById('passwordInput').value;

            errorEl.textContent = '';

            const result = await window.crmAuth.login(email, password);

            if (result.success) {
                this.showApp();
                this.setupRoutes();
                this.setupEventListeners();
                window.crmRouter.start();
            } else {
                errorEl.textContent = result.error;
            }
        });
    }

    // ==========================================================================
    // Routes
    // ==========================================================================

    setupRoutes() {
        // Dashboard
        window.crmRouter.on('/', async () => {
            await this.renderDashboard();
        });

        // All Contacts
        window.crmRouter.on('/contacts', async () => {
            await this.renderContacts();
        });

        // Contact Detail
        window.crmRouter.on('/contact/:id', async (params) => {
            await this.renderContactDetail(params.id);
        });

        // Blog - List (admin only)
        window.crmRouter.on('/blog', async () => {
            if (!window.crmAuth.isAdmin()) return window.crmRouter.navigate('/');
            await this.renderBlogList();
        });

        // Blog - New Post (admin only)
        window.crmRouter.on('/blog/new', async () => {
            if (!window.crmAuth.isAdmin()) return window.crmRouter.navigate('/');
            await this.renderBlogEditor();
        });

        // Blog - Edit Post (admin only)
        window.crmRouter.on('/blog/edit/:id', async (params) => {
            if (!window.crmAuth.isAdmin()) return window.crmRouter.navigate('/');
            await this.renderBlogEditor(params.id);
        });

        // Spark - List (admin only)
        window.crmRouter.on('/spark', async () => {
            if (!window.crmAuth.isAdmin()) return window.crmRouter.navigate('/');
            await this.renderSparkList();
        });

        // Spark - Detail (admin only)
        window.crmRouter.on('/spark/:id', async (params) => {
            if (!window.crmAuth.isAdmin()) return window.crmRouter.navigate('/');
            await this.renderSparkDetail(params.id);
        });

        // Activity Log
        window.crmRouter.on('/activity-log', async () => {
            await this.renderActivityLog();
        });
    }

    // ==========================================================================
    // Event Listeners
    // ==========================================================================

    setupEventListeners() {
        // Quick Add button
        document.getElementById('quickAddBtn').addEventListener('click', () => {
            this.openQuickAdd();
        });

        // Quick Add form
        document.getElementById('quickAddForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.handleQuickAdd(e.target);
        });

        // Logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            window.crmAuth.logout();
            this.showLogin();
            this.setupLoginHandler();
        });

        // Close modal on backdrop click
        document.querySelector('#quickAddModal .modal-backdrop').addEventListener('click', () => {
            this.closeQuickAdd();
        });
    }

    // ==========================================================================
    // Rendering
    // ==========================================================================

    async renderDashboard() {
        const main = document.getElementById('mainContent');
        main.innerHTML = window.CRMComponents.renderLoading();

        try {
            const [data, stats] = await Promise.all([
                window.crmDB.getTodaysActions(),
                window.crmDB.getDashboardStats()
            ]);
            data.stats = stats;
            main.innerHTML = window.CRMComponents.renderDashboard(data);
        } catch (error) {
            main.innerHTML = window.CRMComponents.renderError(error.message);
        }
    }

    async renderContacts() {
        const main = document.getElementById('mainContent');
        main.innerHTML = window.CRMComponents.renderLoading();

        try {
            const contacts = await window.crmDB.getContacts(this.filters);
            main.innerHTML = window.CRMComponents.renderContactsList(contacts, this.filters);
            // Load event tag options into the filter dropdown
            await this.loadEventTagFilter();
        } catch (error) {
            main.innerHTML = window.CRMComponents.renderError(error.message);
        }
    }

    async renderContactDetail(id) {
        const main = document.getElementById('mainContent');
        main.innerHTML = window.CRMComponents.renderLoading();

        try {
            const contact = await window.crmDB.getContact(id);
            main.innerHTML = window.CRMComponents.renderContactDetail(contact);

            // Load activity timeline and notes from table after render
            await this.loadActivityTimeline(id);
            await this.loadNotesFromTable(id);
        } catch (error) {
            main.innerHTML = window.CRMComponents.renderError(error.message);
        }
    }

    async loadActivityTimeline(contactId) {
        const container = document.getElementById('activityTimeline');
        if (!container) return;

        try {
            const activities = await window.crmDB.getActivities(contactId);

            if (activities.length === 0) {
                container.innerHTML = '<p style="color: var(--color-text-muted); font-style: italic;">No activities logged yet.</p>';
                return;
            }

            container.innerHTML = activities.map(a => {
                const date = new Date(a.created_at);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

                const icons = {
                    'call': '📞',
                    'email': '✉️',
                    'meeting': '🤝',
                    'linkedin': '🔗',
                    'note': '📝',
                    'status_change': '🔄'
                };

                const outcomeLabels = {
                    'no_answer': 'No Answer',
                    'left_voicemail': 'Left Voicemail',
                    'connected': 'Connected',
                    'scheduled_meeting': 'Scheduled Meeting',
                    'not_interested': 'Not Interested',
                    'sent': 'Sent',
                    'replied': 'Replied',
                    'bounced': 'Bounced',
                    'completed': 'Completed',
                    'no_show': 'No Show',
                    'rescheduled': 'Rescheduled',
                    'other': 'Other'
                };

                const icon = icons[a.activity_type] || '📝';
                const typeLabel = a.activity_type.charAt(0).toUpperCase() + a.activity_type.slice(1).replace('_', ' ');
                const outcomeLabel = a.outcome ? outcomeLabels[a.outcome] || a.outcome : '';

                return `
                    <div style="display: flex; gap: 12px; padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
                        <div style="font-size: 20px;">${icon}</div>
                        <div style="flex: 1;">
                            <div style="font-weight: 600; margin-bottom: 2px;">
                                ${typeLabel}${outcomeLabel ? ` - ${outcomeLabel}` : ''}
                            </div>
                            ${a.notes ? `<div style="color: #64748b; font-size: 14px; margin-bottom: 4px;">${a.notes}</div>` : ''}
                            <div style="color: #94a3b8; font-size: 12px;">${dateStr} at ${timeStr}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            container.innerHTML = '<p style="color: #dc2626;">Error loading activities.</p>';
        }
    }

    /**
     * Load notes from the notes table (used by VoiceToCRM iOS app)
     */
    async loadNotesFromTable(contactId) {
        const container = document.getElementById('voiceNotesContainer');
        if (!container) {
            console.log('voiceNotesContainer not found');
            return;
        }

        try {
            const notes = await window.crmDB.getNotesForContact(contactId);
            console.log('Notes from table:', notes);

            if (notes.length === 0) return;

            // Build notes HTML
            const notesHtml = notes.map(note => {
                const date = new Date(note.created_at);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const typeIcon = note.note_type === 'voice_note' ? '🎙️' : '📝';

                // Convert markdown-style formatting to HTML
                let content = note.content || '';
                content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
                content = content.replace(/\n/g, '<br>');

                return `
                    <div class="note-entry" style="margin-bottom: 16px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid ${note.note_type === 'voice_note' ? '#3b82f6' : '#94a3b8'};">
                        <div class="note-date" style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
                            ${typeIcon} ${dateStr} ${note.note_type === 'voice_note' ? '(Voice Note)' : ''}
                        </div>
                        <div style="font-size: 14px; line-height: 1.6;">${content}</div>
                    </div>
                `;
            }).join('');

            container.innerHTML = notesHtml;
        } catch (error) {
            console.error('Error loading notes from table:', error);
        }
    }

    // ==========================================================================
    // Navigation
    // ==========================================================================

    goToContact(id) {
        window.crmRouter.navigate(`/contact/${id}`);
    }

    // ==========================================================================
    // Quick Add
    // ==========================================================================

    openQuickAdd() {
        document.getElementById('quickAddModal').style.display = 'flex';
        document.querySelector('#quickAddForm input[name="name"]').focus();
    }

    closeQuickAdd() {
        document.getElementById('quickAddModal').style.display = 'none';
        document.getElementById('quickAddForm').reset();
    }

    async handleQuickAdd(form) {
        const formData = new FormData(form);
        const name = formData.get('name').trim();
        const nameParts = name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '';

        try {
            // Find or create company
            const companyName = formData.get('company');
            const companyId = await window.crmDB.findOrCreateCompany(companyName);

            const contactData = {
                first_name: firstName,
                last_name: lastName,
                email: formData.get('email'),
                phone: formData.get('phone') || null,
                job_title: formData.get('jobTitle') || null,
                linkedin_url: formData.get('linkedinUrl') || null,
                company_id: companyId,
                source: formData.get('source'),
                problem: formData.get('problem') || null
            };

            await window.crmDB.createContact(contactData);

            this.closeQuickAdd();

            // Refresh current view
            const path = window.crmRouter.getCurrentPath();
            if (path === '/') {
                await this.renderDashboard();
            } else if (path === '/contacts') {
                await this.renderContacts();
            }
        } catch (error) {
            alert('Error creating contact: ' + error.message);
        }
    }

    // ==========================================================================
    // LinkedIn Extraction
    // ==========================================================================

    async extractLinkedIn() {
        const urlInput = document.getElementById('linkedinUrlInput');
        const statusEl = document.getElementById('linkedinStatus');
        const url = urlInput.value.trim();

        if (!url) {
            statusEl.textContent = 'Please paste a LinkedIn URL';
            return;
        }

        statusEl.textContent = 'Extracting...';

        try {
            const response = await fetch('/api/extract-contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linkedinUrl: url })
            });

            const data = await response.json();

            if (data.success && data.contact) {
                // Fill form fields
                const c = data.contact;
                if (c.first_name) document.getElementById('qaName').value = `${c.first_name} ${c.last_name || ''}`.trim();
                if (c.linkedin_url) document.getElementById('qaLinkedIn').value = c.linkedin_url;
                if (c.email) document.getElementById('qaEmail').value = c.email;
                if (c.company) document.getElementById('qaCompany').value = c.company;
                if (c.job_title) document.getElementById('qaJobTitle').value = c.job_title;

                // Set source to LinkedIn
                const linkedinRadio = document.querySelector('input[name="source"][value="LinkedIn"]');
                if (linkedinRadio) linkedinRadio.checked = true;

                statusEl.textContent = '✓ Extracted! Fill in remaining fields.';
                urlInput.value = '';
            } else {
                statusEl.textContent = 'Could not extract info. Try manual entry.';
            }
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
        }
    }

    // ==========================================================================
    // Voice Dictation
    // ==========================================================================

    startVoiceDictation() {
        const statusEl = document.getElementById('voiceStatus');
        const voiceBtn = document.getElementById('voiceBtn');

        // Check browser support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            statusEl.textContent = 'Voice not supported in this browser. Try Chrome.';
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        voiceBtn.textContent = '🎤 Listening...';
        voiceBtn.disabled = true;
        statusEl.textContent = 'Speak now: "John Smith from Acme Corp, VP of Operations, email john@acme.com..."';

        recognition.onresult = async (event) => {
            const transcript = event.results[0][0].transcript;
            statusEl.textContent = `Heard: "${transcript}" - Processing...`;

            try {
                const response = await fetch('/api/extract-contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ voiceText: transcript })
                });

                const data = await response.json();

                if (data.success && data.contact) {
                    const c = data.contact;
                    if (c.first_name || c.last_name) {
                        document.getElementById('qaName').value = `${c.first_name || ''} ${c.last_name || ''}`.trim();
                    }
                    if (c.email) document.getElementById('qaEmail').value = c.email;
                    if (c.phone) document.getElementById('qaPhone').value = c.phone;
                    if (c.company) document.getElementById('qaCompany').value = c.company;
                    if (c.job_title) document.getElementById('qaJobTitle').value = c.job_title;
                    if (c.problem) document.getElementById('qaProblem').value = c.problem;

                    // Set source if detected
                    if (c.source) {
                        const sourceRadio = document.querySelector(`input[name="source"][value="${c.source}"]`);
                        if (sourceRadio) sourceRadio.checked = true;
                    }

                    // Set industry if detected
                    if (c.industry) {
                        document.getElementById('qaIndustry').value = c.industry;
                    }

                    statusEl.textContent = '✓ Parsed! Review and fill missing fields.';
                } else {
                    statusEl.textContent = 'Could not parse. Try again or enter manually.';
                }
            } catch (error) {
                statusEl.textContent = 'Error: ' + error.message;
            }

            voiceBtn.textContent = 'Click to Dictate Contact Info';
            voiceBtn.disabled = false;
        };

        recognition.onerror = (event) => {
            statusEl.textContent = 'Error: ' + event.error;
            voiceBtn.textContent = 'Click to Dictate Contact Info';
            voiceBtn.disabled = false;
        };

        recognition.onend = () => {
            voiceBtn.textContent = 'Click to Dictate Contact Info';
            voiceBtn.disabled = false;
        };

        recognition.start();
    }

    // ==========================================================================
    // Filters
    // ==========================================================================

    handleSearch(event) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.filters.search = event.target.value;
            this.renderContacts();
        }, 300);
    }

    handleSourceFilter(value) {
        this.filters.source = value;
        this.renderContacts();
    }

    handleStatusFilter(value) {
        this.filters.status = value;
        this.renderContacts();
    }

    handleEventTagFilter(value) {
        this.filters.event_tag = value;
        this.renderContacts();
    }

    async loadEventTagFilter() {
        try {
            const tags = await window.crmDB.getEventTags();
            const select = document.getElementById('eventTagFilter');
            if (select && tags.length > 0) {
                select.innerHTML = '<option value="">All Campaigns</option>' +
                    tags.map(t => `<option value="${t}" ${this.filters.event_tag === t ? 'selected' : ''}>${t}</option>`).join('');
            }
        } catch (e) {
            console.log('Could not load event tags:', e);
        }
    }

    async pushTaggedToBrevo() {
        const tag = this.filters.event_tag;
        if (!tag) return;

        if (!confirm(`Push all "${tag}" contacts to Brevo? They'll be synced to the Brevo list for this campaign.`)) return;

        try {
            const contacts = await window.crmDB.getContacts({ event_tag: tag });
            const withEmail = contacts.filter(c => c.email);

            if (withEmail.length === 0) {
                alert('No contacts with email addresses found for this tag.');
                return;
            }

            let synced = 0;
            let failed = 0;

            for (const contact of withEmail) {
                try {
                    const success = await window.crmDB.syncToBrevo(contact);
                    if (success) {
                        synced++;
                        // Log the activity
                        await window.crmDB.logActivity(contact.id, {
                            type: 'email',
                            outcome: 'sent',
                            notes: `Synced to Brevo for ${tag} campaign`
                        });
                    } else {
                        failed++;
                    }
                } catch (e) {
                    failed++;
                    console.error('Sync error for', contact.email, e);
                }
            }

            alert(`✅ Done! ${synced} contacts synced to Brevo. ${failed ? failed + ' failed.' : ''}`);
            this.renderContacts();
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    // ==========================================================================
    // Actions
    // ==========================================================================

    async markDone(id) {
        const note = prompt('Add a note (optional):') || '';

        try {
            await window.crmDB.markActionDone(id, note);

            // Refresh view
            const path = window.crmRouter.getCurrentPath();
            if (path === '/') {
                await this.renderDashboard();
            } else if (path.startsWith('/contact/')) {
                await this.renderContactDetail(id);
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    showSnooze(id) {
        const days = prompt('Snooze for how many days?\n1 = Tomorrow\n3 = 3 days\n7 = Next week');
        if (days && !isNaN(days)) {
            this.snoozeAction(id, parseInt(days));
        }
    }

    async snoozeAction(id, days) {
        try {
            await window.crmDB.snoozeAction(id, days);

            const path = window.crmRouter.getCurrentPath();
            if (path === '/') {
                await this.renderDashboard();
            }
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    async updateNextAction(id) {
        const action = document.getElementById('nextActionSelect').value;
        const date = document.getElementById('nextActionDate').value;

        try {
            await window.crmDB.updateContact(id, {
                next_action: action || null,
                next_action_date: date || null
            });
            await this.renderContactDetail(id);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    async addNote(event, id) {
        event.preventDefault();
        const textarea = event.target.querySelector('textarea[name="note"]');
        const noteText = textarea.value.trim();

        if (!noteText) return;

        try {
            await window.crmDB.addNote(id, noteText);
            await this.renderContactDetail(id);
        } catch (error) {
            alert('Error: ' + error.message);
        }
    }

    async editContact(id) {
        try {
            const contact = await window.crmDB.getContact(id);

            // Populate form fields
            document.getElementById('editContactId').value = id;
            document.getElementById('editFirstName').value = contact.first_name || '';
            document.getElementById('editLastName').value = contact.last_name || '';
            document.getElementById('editEmail').value = contact.email || '';
            document.getElementById('editPhone').value = contact.phone || '';
            document.getElementById('editCompany').value = contact.companies?.name || '';
            document.getElementById('editJobTitle').value = contact.job_title || '';
            document.getElementById('editLinkedIn').value = contact.linkedin_url || '';
            document.getElementById('editStatus').value = contact.status || 'New';
            document.getElementById('editSource').value = contact.source || 'Other';
            document.getElementById('editIntentReason').value = contact.intent_reason || '';
            document.getElementById('editSourceLinks').value = contact.source_links || '';
            document.getElementById('editEventTag').value = contact.event_tag || '';
            document.getElementById('editProblem').value = contact.problem || '';

            // Load event tag suggestions
            try {
                const tags = await window.crmDB.getEventTags();
                const datalist = document.getElementById('editEventTagList');
                datalist.innerHTML = tags.map(tag => `<option value="${tag}">`).join('');
            } catch (e) {
                console.log('Could not load event tags:', e);
            }

            // Show modal
            document.getElementById('editContactModal').style.display = 'flex';
        } catch (error) {
            alert('Error loading contact: ' + error.message);
        }
    }

    closeEditContact() {
        document.getElementById('editContactModal').style.display = 'none';
    }

    async saveEditContact() {
        const id = document.getElementById('editContactId').value;
        const companyName = document.getElementById('editCompany').value.trim();

        try {
            // Handle company - find or create
            let companyId = null;
            if (companyName) {
                companyId = await window.crmDB.findOrCreateCompany(companyName);
            }

            const updates = {
                first_name: document.getElementById('editFirstName').value.trim(),
                last_name: document.getElementById('editLastName').value.trim(),
                email: document.getElementById('editEmail').value.trim(),
                phone: document.getElementById('editPhone').value.trim() || null,
                job_title: document.getElementById('editJobTitle').value.trim() || null,
                linkedin_url: document.getElementById('editLinkedIn').value.trim() || null,
                status: document.getElementById('editStatus').value,
                source: document.getElementById('editSource').value,
                intent_reason: document.getElementById('editIntentReason').value.trim() || null,
                source_links: document.getElementById('editSourceLinks').value.trim() || null,
                event_tag: document.getElementById('editEventTag').value.trim() || null,
                problem: document.getElementById('editProblem').value.trim() || null,
                company_id: companyId
            };

            await window.crmDB.updateContact(id, updates);
            this.closeEditContact();
            await this.renderContactDetail(id);
        } catch (error) {
            alert('Error saving contact: ' + error.message);
        }
    }

    async deleteContact() {
        const id = document.getElementById('editContactId').value;
        const name = document.getElementById('editFirstName').value + ' ' + document.getElementById('editLastName').value;

        if (!confirm(`Are you sure you want to delete "${name.trim()}"?\n\nThis will also delete all their activity history. This cannot be undone.`)) {
            return;
        }

        try {
            await window.crmDB.deleteContact(id);
            this.closeEditContact();
            // Go back to contacts list
            window.crmRouter.navigate('/contacts');
        } catch (error) {
            alert('Error deleting contact: ' + error.message);
        }
    }

    async pushToBrevo(id) {
        const listSelect = document.getElementById('brevoListSelect');
        const listId = listSelect ? parseInt(listSelect.value) : 7;
        const listName = listSelect ? listSelect.options[listSelect.selectedIndex].text : 'Met in Person';

        if (!confirm(`Push this contact to Brevo list "${listName}"?`)) return;

        try {
            const contact = await window.crmDB.getContact(id);
            // Override the tag based on selected list
            const listToTag = { 15: 'met-lead', 16: 'direct-lead', 17: 'linkedin-lead', 18: 'referral-lead', 14: 'spark-lead' };
            contact.brevo_tag = listToTag[listId] || 'met-lead';
            await window.crmDB.syncToBrevo(contact);

            // Log activity: contact added to Brevo
            await window.crmDB.logActivity(id, {
                type: 'email',
                outcome: 'sent',
                notes: `Added to Brevo list: ${listName}`
            });

            await this.renderContactDetail(id);
        } catch (error) {
            alert('Push failed: ' + error.message);
        }
    }

    async syncAllToBrevo() {
        const btn = document.getElementById('syncBrevoBtn');
        const originalText = btn.textContent;

        btn.textContent = '⏳ Syncing...';
        btn.disabled = true;

        try {
            const result = await window.crmDB.syncAllToBrevo();

            if (result.total === 0) {
                alert('All contacts are already synced to Brevo!');
            } else {
                alert(`Synced ${result.synced} of ${result.total} contacts to Brevo!${result.failed > 0 ? `\n\n${result.failed} failed (check console for details).` : ''}`);
            }

            // Refresh current view
            const path = window.crmRouter.getCurrentPath();
            if (path === '/') {
                await this.renderDashboard();
            } else if (path === '/contacts') {
                await this.renderContacts();
            }
        } catch (error) {
            alert('Sync failed: ' + error.message);
        }

        btn.textContent = originalText;
        btn.disabled = false;
    }

    // ==========================================================================
    // CSV Import
    // ==========================================================================

    async openCsvImport() {
        document.getElementById('csvImportModal').style.display = 'flex';
        this.resetCsvImport();

        // Load existing event tags for the dropdown
        try {
            const tags = await window.crmDB.getEventTags();
            const datalist = document.getElementById('eventTagList');
            datalist.innerHTML = tags.map(tag => `<option value="${tag}">`).join('');
        } catch (e) {
            console.log('Could not load event tags:', e);
        }
    }

    closeCsvImport() {
        document.getElementById('csvImportModal').style.display = 'none';
        this.csvData = null;
        // Refresh contacts view
        const path = window.crmRouter.getCurrentPath();
        if (path === '/contacts') {
            this.renderContacts();
        } else if (path === '/') {
            this.renderDashboard();
        }
    }

    resetCsvImport() {
        document.getElementById('csvStep1').style.display = 'block';
        document.getElementById('csvStep2').style.display = 'none';
        document.getElementById('csvStep3').style.display = 'none';
        document.getElementById('csvStep4').style.display = 'none';
        document.getElementById('csvFileInput').value = '';
        this.csvData = null;
    }

    handleCsvSelect(event) {
        const file = event.target.files[0];
        if (file) this.parseCsvFile(file);
    }

    handleCsvDrop(event) {
        const file = event.dataTransfer.files[0];
        if (file && (file.name.endsWith('.csv') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls'))) {
            this.parseCsvFile(file);
        }
    }

    parseCsvFile(file) {
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');

        if (isExcel) {
            // Parse Excel with SheetJS
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });

                    if (rows.length < 2) {
                        alert('Excel file is empty or has no data rows.');
                        return;
                    }

                    // Convert all values to strings for consistency
                    const stringRows = rows.map(row => row.map(cell => String(cell || '')));

                    this.csvData = {
                        headers: stringRows[0],
                        rows: stringRows.slice(1).filter(row => row.some(cell => cell.trim())), // Remove empty rows
                        columnMap: this.autoMapColumns(stringRows[0])
                    };

                    this.showCsvPreview();
                } catch (err) {
                    alert('Error parsing Excel file: ' + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // Parse CSV as before
            const reader = new FileReader();
            reader.onload = (e) => {
                const text = e.target.result;
                const rows = this.parseCSV(text);

                if (rows.length < 2) {
                    alert('CSV file is empty or has no data rows.');
                    return;
                }

                this.csvData = {
                    headers: rows[0],
                    rows: rows.slice(1),
                    columnMap: this.autoMapColumns(rows[0])
                };

                this.showCsvPreview();
            };
            reader.readAsText(file);
        }
    }

    parseCSV(text) {
        const rows = [];
        let currentRow = [];
        let currentCell = '';
        let insideQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentCell += '"';
                    i++;
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === ',' && !insideQuotes) {
                currentRow.push(currentCell.trim());
                currentCell = '';
            } else if ((char === '\n' || (char === '\r' && nextChar === '\n')) && !insideQuotes) {
                currentRow.push(currentCell.trim());
                if (currentRow.some(cell => cell)) {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentCell = '';
                if (char === '\r') i++;
            } else {
                currentCell += char;
            }
        }

        // Handle last row
        if (currentCell || currentRow.length) {
            currentRow.push(currentCell.trim());
            if (currentRow.some(cell => cell)) {
                rows.push(currentRow);
            }
        }

        return rows;
    }

    autoMapColumns(headers) {
        const map = {};
        const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

        // Auto-detect common column names (including Clay export variations)
        const patterns = {
            email: ['email', 'emailaddress', 'mail', 'workemail', 'personalemail', 'emailwork'],
            first_name: ['firstname', 'first', 'fname', 'givenname'],
            last_name: ['lastname', 'last', 'lname', 'surname', 'familyname'],
            full_name: ['name', 'fullname', 'contactname', 'personname'],  // For Notion exports
            company: ['company', 'companyname', 'organization', 'org', 'employer', 'companytabledata', 'companydomain'],
            phone: ['phone', 'phonenumber', 'mobile', 'cell', 'telephone', 'mobilephone', 'workphone'],
            job_title: ['title', 'jobtitle', 'position', 'role', 'jobrole'],
            linkedin_url: ['linkedin', 'linkedinurl', 'linkedinprofile', 'linkedinlink'],
            intent_reason: ['reason', 'intentreason', 'reasoning', 'notes', 'whyhighintent'],
            source_links: ['formula', 'sourcelinks', 'links', 'sources', 'researchlinks'],
            location: ['location', 'city', 'address', 'region'],
            event_tag: ['leadsource', 'source', 'tag', 'campaign', 'event']  // Lead Source → Event Tag
        };

        for (const [field, keywords] of Object.entries(patterns)) {
            const index = normalizedHeaders.findIndex(h => keywords.includes(h));
            if (index !== -1) {
                map[field] = index;
            }
        }

        return map;
    }

    showCsvPreview() {
        document.getElementById('csvStep1').style.display = 'none';
        document.getElementById('csvStep2').style.display = 'block';

        const { headers, rows, columnMap } = this.csvData;

        document.getElementById('csvRowCount').textContent = `${rows.length} contacts found`;

        // Build preview table showing first 5 rows
        const previewRows = rows.slice(0, 5);
        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                    <tr style="background: #f1f5f9;">
                        ${headers.map((h, i) => {
            const mappedTo = Object.entries(columnMap).find(([k, v]) => v === i);
            const badge = mappedTo ? `<span style="display: block; font-size: 11px; color: #8b5cf6; font-weight: 600;">→ ${mappedTo[0]}</span>` : '';
            return `<th style="padding: 8px; border: 1px solid #e2e8f0; text-align: left;">${h}${badge}</th>`;
        }).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${previewRows.map(row => `
                        <tr>
                            ${headers.map((_, i) => `<td style="padding: 8px; border: 1px solid #e2e8f0;">${row[i] || ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        if (rows.length > 5) {
            html += `<p style="text-align: center; color: #94a3b8; margin-top: 12px;">...and ${rows.length - 5} more contacts</p>`;
        }

        // Check if email column is mapped
        if (columnMap.email === undefined) {
            html = `<div style="padding: 20px; background: #fef2f2; border-radius: 8px; color: #dc2626; margin-bottom: 16px;">
                <strong>⚠️ Could not find email column.</strong><br>
                Make sure your CSV has a column named "Email" or "email".
            </div>` + html;
            document.getElementById('csvImportBtn').disabled = true;
        } else {
            document.getElementById('csvImportBtn').disabled = false;
        }

        document.getElementById('csvPreviewTable').innerHTML = html;
    }

    async importCsvContacts() {
        if (!this.csvData || !this.csvData.columnMap.email === undefined) return;

        const { rows, columnMap } = this.csvData;
        const source = document.getElementById('csvImportSource').value;
        const eventTag = document.getElementById('csvEventTag').value.trim() || null;
        const skipBrevo = document.getElementById('csvSkipBrevo').checked;

        // Show progress
        document.getElementById('csvStep2').style.display = 'none';
        document.getElementById('csvStep3').style.display = 'block';

        let imported = 0;
        let skipped = 0;
        let skipReasons = { noEmail: 0, invalidEmail: 0, dbError: 0 };

        // Log column mapping for debugging
        console.log('📊 Column Mapping:', columnMap);
        console.log('📋 Headers:', this.csvData.headers);
        console.log('📋 Normalized Headers:', this.csvData.headers.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, '')));

        // Show first row mapping
        if (rows.length > 0) {
            const firstRow = rows[0];
            console.log('📌 First row sample:', {
                email: firstRow[columnMap.email],
                first_name: firstRow[columnMap.first_name],
                last_name: firstRow[columnMap.last_name],
                company: firstRow[columnMap.company],
                phone: firstRow[columnMap.phone],
                job_title: firstRow[columnMap.job_title],
                linkedin_url: firstRow[columnMap.linkedin_url],
                intent_reason: firstRow[columnMap.intent_reason],
                source_links: firstRow[columnMap.source_links],
            });
        }

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const email = row[columnMap.email] || null;

            // Handle full name column (for Notion exports) - split into first/last
            let firstName = row[columnMap.first_name] || '';
            let lastName = row[columnMap.last_name] || '';

            if (!firstName && !lastName && columnMap.full_name !== undefined) {
                const fullName = (row[columnMap.full_name] || '').trim();
                if (fullName) {
                    const nameParts = fullName.split(/\s+/);
                    firstName = nameParts[0] || '';
                    lastName = nameParts.slice(1).join(' ') || '';  // Everything after first word
                }
            }

            // Skip only if we have NO identifying info (no name at all)
            if (!firstName && !lastName) {
                skipped++;
                if (i < 5) console.log(`Row ${i}: Skipped - no name data`);
                continue;
            }

            // Validate email format if provided
            if (email && !email.includes('@')) {
                skipReasons.invalidEmail++;
                // Still import but without the invalid email
                console.log(`Row ${i}: Invalid email "${email}" - importing without email`);
            }

            const contact = {
                first_name: firstName,
                last_name: lastName,
                email: (email && email.includes('@')) ? email : null,
                phone: row[columnMap.phone] || null,
                job_title: row[columnMap.job_title] || null,
                linkedin_url: row[columnMap.linkedin_url] || null,
                intent_reason: row[columnMap.intent_reason] || null,
                source_links: row[columnMap.source_links] || null,
                source: source,
                event_tag: row[columnMap.event_tag] || eventTag,  // CSV column takes priority, then manual input
                status: 'New',
                brevo_tag: source === 'Clay Import' ? 'clay-lead' :
                    source === 'LinkedIn' ? 'linkedin-lead' :
                        source === 'Referral' ? 'referral-lead' :
                            source === 'Event' ? 'event-lead' : 'other-lead'
            };

            // Handle company
            const companyName = row[columnMap.company];
            if (companyName) {
                try {
                    contact.company_id = await window.crmDB.findOrCreateCompany(companyName);
                } catch (e) {
                    console.error('Error creating company:', e);
                }
            }

            try {
                await window.crmDB.createContact(contact, { skipBrevo });
                imported++;
            } catch (e) {
                console.error(`Error importing ${firstName} ${lastName}:`, e.message);
                skipReasons.dbError++;
                skipped++;
            }

            // Update progress
            const progress = Math.round(((i + 1) / rows.length) * 100);
            document.getElementById('csvProgressBar').style.width = progress + '%';
            document.getElementById('csvProgressText').textContent = `Importing... ${i + 1} of ${rows.length}`;
        }

        // Log skip summary
        if (skipped > 0) {
            console.log('📉 Skip Summary:', skipReasons);
        }

        // Show complete
        document.getElementById('csvStep3').style.display = 'none';
        document.getElementById('csvStep4').style.display = 'block';

        let skipDetail = '';
        if (skipped > 0) {
            const parts = [];
            if (skipReasons.noEmail > 0) parts.push(`${skipReasons.noEmail} missing email`);
            if (skipReasons.invalidEmail > 0) parts.push(`${skipReasons.invalidEmail} invalid email`);
            if (skipReasons.dbError > 0) parts.push(`${skipReasons.dbError} DB errors`);
            skipDetail = ` (${skipped} skipped: ${parts.join(', ')})`;
        }
        document.getElementById('csvCompleteText').textContent = `Imported ${imported} contacts!${skipDetail}`;
    }

    // ==========================================================================
    // Log Outcome
    // ==========================================================================

    openLogOutcome(contactId, contactName, actionType) {
        document.getElementById('logOutcomeModal').style.display = 'flex';
        document.getElementById('logContactId').value = contactId;
        document.getElementById('logContactName').textContent = contactName;
        document.getElementById('logNotes').value = '';

        // Set title
        document.getElementById('logOutcomeTitle').textContent = '📝 Log Activity';

        // Pre-select the activity type based on what was scheduled (if valid)
        const activityDropdown = document.getElementById('logActivityType');
        const normalizedType = (actionType || 'call').toLowerCase();
        if (['call', 'email', 'linkedin', 'meeting'].includes(normalizedType)) {
            activityDropdown.value = normalizedType;
        } else {
            activityDropdown.value = 'call';  // Default to call
        }

        // Update outcome options
        this.updateOutcomeOptions();

        // Set default next action date to tomorrow
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        document.getElementById('logNextDate').value = tomorrow.toISOString().split('T')[0];
    }

    updateOutcomeOptions() {
        const actionType = document.getElementById('logActivityType').value;
        const outcomes = this.getOutcomeOptions(actionType);
        const container = document.getElementById('outcomeOptions');
        container.innerHTML = outcomes.map(o => `
            <label style="display: flex; align-items: center; gap: 8px; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; cursor: pointer;">
                <input type="radio" name="outcome" value="${o.value}" ${o.default ? 'checked' : ''}>
                <span>${o.emoji} ${o.label}</span>
            </label>
        `).join('');
    }

    getOutcomeOptions(actionType) {
        const options = {
            'call': [
                { value: 'no_answer', label: 'No Answer', emoji: '📵', default: true },
                { value: 'left_voicemail', label: 'Left Voicemail', emoji: '📝' },
                { value: 'connected', label: 'Connected', emoji: '✅' },
                { value: 'scheduled_meeting', label: 'Scheduled Meeting', emoji: '📅' },
                { value: 'not_interested', label: 'Not Interested', emoji: '❌' }
            ],
            'email': [
                { value: 'sent', label: 'Sent', emoji: '📤', default: true },
                { value: 'replied', label: 'They Replied', emoji: '📬' },
                { value: 'scheduled_meeting', label: 'Scheduled Meeting', emoji: '📅' },
                { value: 'not_interested', label: 'Unsubscribed/Not Interested', emoji: '❌' }
            ],
            'linkedin': [
                { value: 'sent', label: 'Message Sent', emoji: '📤', default: true },
                { value: 'connected', label: 'Connected', emoji: '🤝' },
                { value: 'replied', label: 'They Replied', emoji: '💬' },
                { value: 'scheduled_meeting', label: 'Scheduled Meeting', emoji: '📅' },
                { value: 'not_interested', label: 'No Response/Not Interested', emoji: '❌' }
            ],
            'meeting': [
                { value: 'completed', label: 'Meeting Completed', emoji: '✅', default: true },
                { value: 'no_show', label: 'They No-Showed', emoji: '❌' },
                { value: 'rescheduled', label: 'Rescheduled', emoji: '📅' },
                { value: 'won', label: 'Won / Closed Deal', emoji: '🎉' },
                { value: 'not_interested', label: 'Not Moving Forward', emoji: '👎' }
            ]
        };
        return options[actionType] || options['call'];
    }

    closeLogOutcome() {
        document.getElementById('logOutcomeModal').style.display = 'none';
    }

    async submitLogOutcome() {
        const contactId = document.getElementById('logContactId').value;
        const activityType = document.getElementById('logActivityType').value; // User's actual selection
        const outcome = document.querySelector('input[name="outcome"]:checked')?.value;
        const notes = document.getElementById('logNotes').value.trim();
        const nextAction = document.getElementById('logNextAction').value;
        const nextDate = document.getElementById('logNextDate').value;

        if (!outcome) {
            alert('Please select what happened.');
            return;
        }

        try {
            await window.crmDB.completeAction(
                contactId,
                outcome,
                notes,
                nextAction,
                nextAction !== 'None' ? nextDate : null,
                activityType  // Pass the actual selected type
            );

            this.closeLogOutcome();

            // Refresh dashboard
            await this.renderDashboard();
        } catch (error) {
            alert('Error logging outcome: ' + error.message);
        }
    }

    // ==========================================================================
    // Spark — Price of Doing Nothing Management
    // ==========================================================================

    async renderSparkList() {
        const main = document.getElementById('mainContent');
        const briefs = await window.crmDB.getSparkBriefs();

        const statusGroups = {
            'New': briefs.filter(b => b.status === 'Draft'),
            'Shared': briefs.filter(b => b.status === 'Shared'),
            'Qualified': briefs.filter(b => b.status === 'Qualified'),
            'In Progress': briefs.filter(b => b.status === 'In Progress'),
            'Deployed': briefs.filter(b => ['Deployed', 'Measuring'].includes(b.status)),
            'Closed': briefs.filter(b => b.status === 'Closed Lost')
        };

        main.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <div>
                        <h2 style="margin: 0;">⚡ Spark — Submissions</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">"Price of Doing Nothing" calculator submissions</p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span class="badge" style="background: #f0fdf4; color: #047857;">${briefs.length} total</span>
                        <a href="/spark/new" target="_blank" class="btn btn-secondary btn-sm">Open Calculator ↗</a>
                    </div>
                </div>

                ${briefs.length === 0 ? `
                    <div class="card" style="text-align: center; padding: 48px;">
                        <p style="font-size: 18px; margin-bottom: 8px;">No submissions yet</p>
                        <p style="color: #64748b;">When prospects use the Price of Doing Nothing Calculator on your website, their submissions will appear here.</p>
                    </div>
                ` : ''}

                ${Object.entries(statusGroups)
                .filter(([_, items]) => items.length > 0)
                .map(([status, items]) => `
                        <h3 style="font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 10px;">
                            ${status} (${items.length})
                        </h3>
                        ${items.map(brief => this._renderSparkCard(brief)).join('')}
                    `).join('')}
            </div>
        `;
    }

    _renderSparkCard(brief) {
        const date = new Date(brief.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const annualCost = brief.annual_current_cost ? `$${Math.round(brief.annual_current_cost).toLocaleString()}` : '—';
        const savings = brief.annual_potential_savings ? `$${Math.round(brief.annual_potential_savings).toLocaleString()}` : '—';

        const statusColors = {
            'Draft': { bg: '#f1f5f9', color: '#475569' },
            'Shared': { bg: '#dbeafe', color: '#1d4ed8' },
            'Qualified': { bg: '#fef3c7', color: '#92400e' },
            'In Progress': { bg: '#ede9fe', color: '#6d28d9' },
            'Deployed': { bg: '#d1fae5', color: '#047857' },
            'Measuring': { bg: '#d1fae5', color: '#047857' },
            'Closed Lost': { bg: '#fef2f2', color: '#991b1b' }
        };
        const sc = statusColors[brief.status] || statusColors['Draft'];

        return `
            <div class="card" style="margin-bottom: 10px; cursor: pointer;" onclick="window.crmRouter.navigate('/spark/${brief.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px;">
                            <span class="badge" style="background: ${sc.bg}; color: ${sc.color}; font-size: 11px;">${brief.status}</span>
                            ${brief.solution_level ? `<span class="badge" style="font-size: 11px;">${brief.solution_level.split(' - ')[0]}</span>` : ''}
                            ${brief.created_by === 'Website (Public)' ? '<span class="badge" style="background: #fef3c7; color: #92400e; font-size: 11px;">🌐 Website</span>' : ''}
                        </div>
                        <h3 style="margin: 0 0 4px; font-size: 16px;">${brief.title || 'Untitled Brief'}</h3>
                        <p style="color: #64748b; font-size: 13px; margin: 0;">
                            ${brief.company_name ? `${brief.company_name} · ` : ''}${brief.contact_name || 'No contact'}
                        </p>
                    </div>
                    <div style="text-align: right; min-width: 120px;">
                        <div style="font-size: 12px; color: #94a3b8;">${date}</div>
                        <div style="font-size: 15px; font-weight: 600; color: #059669; margin-top: 4px;">${savings}/yr</div>
                        <div style="font-size: 11px; color: #94a3b8;">Cost: ${annualCost}/yr</div>
                    </div>
                </div>
            </div>
        `;
    }

    async renderSparkDetail(id) {
        const main = document.getElementById('mainContent');
        let brief;
        try {
            brief = await window.crmDB.getSparkBrief(id);
        } catch (e) {
            main.innerHTML = '<div class="card"><p>Brief not found.</p></div>';
            return;
        }

        if (!brief) {
            main.innerHTML = '<div class="card"><p>Brief not found.</p></div>';
            return;
        }

        const annualCost = brief.annual_current_cost ? `$${Math.round(brief.annual_current_cost).toLocaleString()}` : '—';
        const savings = brief.annual_potential_savings ? `$${Math.round(brief.annual_potential_savings).toLocaleString()}` : '—';
        const statuses = ['Draft', 'Shared', 'Qualified', 'In Progress', 'Deployed', 'Measuring', 'Closed Lost'];

        main.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <a href="#/spark" class="btn btn-ghost btn-sm" style="margin-bottom: 16px;">← Back to Spark</a>

                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                        <div>
                            <h2 style="margin: 0 0 4px;">${brief.title || 'Untitled Brief'}</h2>
                            <p style="color: #64748b; margin: 0;">
                                ${brief.company_name ? `${brief.company_name} · ` : ''}${brief.contact_name || 'No contact'}
                                ${brief.contact_email ? ` · ${brief.contact_email}` : ''}
                            </p>
                        </div>
                        ${brief.share_id ? `<a href="/spark/s/${brief.share_id}" target="_blank" class="btn btn-ghost btn-sm">View Share Link ↗</a>` : ''}
                    </div>

                    <!-- Status Selector -->
                    <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 20px;">
                        <label style="font-size: 13px; color: #64748b;">Status:</label>
                        <select id="sparkStatusSelect" class="filter-select" style="padding: 6px 12px;">
                            ${statuses.map(s => `<option value="${s}" ${brief.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                        </select>
                        <button class="btn btn-sm btn-secondary" onclick="window.crmApp.updateSparkStatus('${brief.id}')">Update</button>
                    </div>

                    <!-- CNC Numbers -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                        <div>
                            <span style="font-size: 12px; color: #64748b; display: block;">Hours/Week</span>
                            <strong style="font-size: 18px;">${brief.hours_per_week || '—'}</strong>
                        </div>
                        <div>
                            <span style="font-size: 12px; color: #64748b; display: block;">People</span>
                            <strong style="font-size: 18px;">${brief.people_involved || '—'}</strong>
                        </div>
                        <div>
                            <span style="font-size: 12px; color: #64748b; display: block;">Price of Doing Nothing</span>
                            <strong style="font-size: 18px; color: #dc2626;">${annualCost}/yr</strong>
                        </div>
                        <div>
                            <span style="font-size: 12px; color: #64748b; display: block;">Potential Savings</span>
                            <strong style="font-size: 18px; color: #059669;">${savings}/yr</strong>
                        </div>
                    </div>
                </div>

                <!-- Problem -->
                ${brief.problem_clean || brief.problem_raw ? `
                    <div class="card">
                        <h4 style="margin: 0 0 12px; color: #64748b; font-size: 13px; text-transform: uppercase;">The Problem</h4>
                        <p style="line-height: 1.7;">${brief.problem_clean || brief.problem_raw}</p>
                        ${brief.problem_raw && brief.problem_clean ? `
                            <details style="margin-top: 12px;">
                                <summary style="cursor: pointer; font-size: 13px; color: #94a3b8;">Original input</summary>
                                <p style="font-style: italic; color: #64748b; margin-top: 8px;">"${brief.problem_raw}"</p>
                            </details>
                        ` : ''}
                    </div>
                ` : ''}

                <!-- AI Solution -->
                ${brief.solution_level || brief.suggested_approach ? `
                    <div class="card">
                        <h4 style="margin: 0 0 12px; color: #64748b; font-size: 13px; text-transform: uppercase;">AI Recommendation</h4>
                        ${brief.solution_level ? `<p style="margin-bottom: 8px;"><strong>${brief.solution_level}</strong></p>` : ''}
                        ${brief.level_reasoning ? `<p style="color: #64748b; margin-bottom: 12px;">${brief.level_reasoning}</p>` : ''}
                        ${brief.suggested_approach ? `<p style="line-height: 1.7;">${brief.suggested_approach}</p>` : ''}
                    </div>
                ` : ''}

                <!-- Metadata -->
                <div class="card" style="font-size: 13px; color: #94a3b8;">
                    <div style="display: flex; gap: 16px; flex-wrap: wrap;">
                        ${brief.department ? `<span>Dept: ${brief.department}</span>` : ''}
                        ${brief.created_by ? `<span>Source: ${brief.created_by}</span>` : ''}
                        <span>Created: ${new Date(brief.created_at).toLocaleDateString()}</span>
                        ${brief.share_link_views ? `<span>Share views: ${brief.share_link_views}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    async updateSparkStatus(id) {
        const select = document.getElementById('sparkStatusSelect');
        const newStatus = select.value;
        try {
            await window.crmDB.updateBriefStatus(id, newStatus);
            await this.renderSparkDetail(id);
        } catch (error) {
            alert('Error updating status: ' + error.message);
        }
    }

    // ==========================================================================
    // Blog Management
    // ==========================================================================

    async renderBlogList() {
        const main = document.getElementById('mainContent');
        const posts = await window.crmDB.getBlogPosts();

        const published = posts.filter(p => p.status === 'published');
        const drafts = posts.filter(p => p.status === 'draft');

        main.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0;">✍️ Blog Posts</h2>
                    <a href="#/blog/new" class="btn btn-primary btn-sm">+ New Post</a>
                </div>

                ${drafts.length > 0 ? `
                    <h3 style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">Drafts</h3>
                    ${drafts.map(post => this._renderBlogCard(post)).join('')}
                ` : ''}

                ${published.length > 0 ? `
                    <h3 style="font-size: 14px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; margin: 24px 0 12px;">Published</h3>
                    ${published.map(post => this._renderBlogCard(post)).join('')}
                ` : ''}

                ${posts.length === 0 ? `
                    <div class="card" style="text-align: center; padding: 48px;">
                        <p style="font-size: 18px; margin-bottom: 8px;">No blog posts yet</p>
                        <p style="color: #64748b; margin-bottom: 16px;">Use Claude to write your first article, then paste it here.</p>
                        <a href="#/blog/new" class="btn btn-primary">Write Your First Post</a>
                    </div>
                ` : ''}
            </div>
        `;
    }

    _renderBlogCard(post) {
        const date = post.published_at
            ? new Date(post.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : new Date(post.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

        const categoryColors = {
            'healthcare': '#059669',
            'private-equity': '#7c3aed',
            'ai-strategy': '#2563eb',
            'case-study': '#d97706'
        };
        const catColor = categoryColors[post.category] || '#64748b';
        const catLabel = (post.category || 'ai-strategy').replace('-', ' ');

        return `
            <div class="card" style="margin-bottom: 12px; cursor: pointer;" onclick="window.crmRouter.navigate('/blog/edit/${post.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 8px;">
                            <span class="badge" style="background: ${post.status === 'published' ? '#d1fae5' : '#fef3c7'}; color: ${post.status === 'published' ? '#047857' : '#92400e'}; font-size: 11px;">
                                ${post.status === 'published' ? '🟢 Published' : '📝 Draft'}
                            </span>
                            <span class="badge" style="background: ${catColor}15; color: ${catColor}; font-size: 11px; text-transform: capitalize;">${catLabel}</span>
                        </div>
                        <h3 style="margin: 0 0 4px; font-size: 16px;">${post.title}</h3>
                        ${post.excerpt ? `<p style="color: #64748b; font-size: 13px; margin: 0;">${post.excerpt}</p>` : ''}
                    </div>
                    <div style="text-align: right; font-size: 12px; color: #94a3b8; min-width: 80px;">
                        <div>${date}</div>
                        <div>${post.read_time || 5} min read</div>
                    </div>
                </div>
            </div>
        `;
    }

    async renderBlogEditor(postId = null) {
        const main = document.getElementById('mainContent');
        let post = { title: '', excerpt: '', content: '', category: 'ai-strategy', status: 'draft' };

        if (postId) {
            try {
                post = await window.crmDB.getBlogPost(postId);
            } catch (e) {
                main.innerHTML = '<div class="card"><p>Post not found.</p></div>';
                return;
            }
        }

        const isEdit = !!postId;
        const siteUrl = 'https://marcoslacayobosche.com';

        main.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <a href="#/blog" class="btn btn-ghost btn-sm" style="margin-bottom: 16px;">← Back to Posts</a>
                
                <div class="card">
                    <h2 style="margin: 0 0 20px;">${isEdit ? 'Edit Post' : 'New Post'}</h2>
                    
                    <div style="display: flex; gap: 16px; margin-bottom: 16px;">
                        <div style="flex: 2;">
                            <label style="font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Title *</label>
                            <input type="text" id="blogTitle" class="filter-select" style="width: 100%; font-size: 16px; padding: 10px;" 
                                   value="${post.title}" placeholder="e.g. Why 87% of AI Projects Fail in Healthcare">
                        </div>
                        <div style="flex: 1;">
                            <label style="font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Category</label>
                            <select id="blogCategory" class="filter-select" style="width: 100%; padding: 10px;">
                                <option value="healthcare" ${post.category === 'healthcare' ? 'selected' : ''}>Healthcare</option>
                                <option value="private-equity" ${post.category === 'private-equity' ? 'selected' : ''}>Private Equity</option>
                                <option value="ai-strategy" ${post.category === 'ai-strategy' ? 'selected' : ''}>AI Strategy</option>
                                <option value="case-study" ${post.category === 'case-study' ? 'selected' : ''}>Case Study</option>
                            </select>
                        </div>
                    </div>

                    <div style="margin-bottom: 16px;">
                        <label style="font-size: 12px; color: #64748b; display: block; margin-bottom: 4px;">Excerpt (short preview for blog listing)</label>
                        <input type="text" id="blogExcerpt" class="filter-select" style="width: 100%; padding: 10px;" 
                               value="${post.excerpt || ''}" placeholder="One sentence that hooks the reader...">
                    </div>

                    <div style="margin-bottom: 16px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                            <label style="font-size: 12px; color: #64748b;">Content *</label>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span id="imageUploadStatus" style="font-size: 12px; color: #64748b;"></span>
                                <input type="file" id="blogImageInput" accept="image/*" style="display: none;" onchange="window.crmApp.handleBlogImageUpload(event)">
                                <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('blogImageInput').click()" style="font-size: 13px;">
                                    📷 Insert Image
                                </button>
                            </div>
                        </div>
                        <div id="blogContent">${post.content || ''}</div>
                    </div>

                    <div style="display: flex; gap: 12px; justify-content: space-between; align-items: center; border-top: 1px solid #e2e8f0; padding-top: 16px;">
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-primary" onclick="window.crmApp.saveBlogPost('${postId || ''}')">
                                💾 Save ${isEdit ? '' : 'Draft'}
                            </button>
                            ${isEdit && post.status === 'draft' ? `
                                <button class="btn btn-secondary" onclick="window.crmApp.publishBlogPost('${postId}')">
                                    🚀 Publish
                                </button>
                            ` : ''}
                            ${isEdit && post.status === 'published' ? `
                                <button class="btn btn-ghost" onclick="window.crmApp.unpublishBlogPost('${postId}')">
                                    📝 Unpublish
                                </button>
                                <a href="${siteUrl}/blog/#${post.slug}" target="_blank" class="btn btn-ghost">
                                    🔗 View Live
                                </a>
                            ` : ''}
                        </div>
                        ${isEdit ? `
                            <button class="btn btn-ghost" style="color: #ef4444;" onclick="window.crmApp.deleteBlogPost('${postId}')">
                                🗑️ Delete
                            </button>
                        ` : ''}
                    </div>
                </div>

                ${isEdit && post.status === 'published' ? `
                    <div class="card" style="margin-top: 16px; border: 1px solid #7c3aed20;">
                        <h3 style="margin: 0 0 12px; font-size: 14px; color: #7c3aed;">📧 Send to Brevo</h3>
                        <p style="font-size: 13px; color: #64748b; margin-bottom: 12px;">Email this blog post to a Brevo list. Select the list(s) below:</p>
                        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                            <select id="brevoSendList" class="filter-select" style="padding: 8px 12px; min-width: 180px;">
                                <option value="all">📋 All Lists</option>
                                <option value="19">🏥 HIMSS 26</option>
                                <option value="15">Met in Person</option>
                                <option value="16">Direct Call</option>
                                <option value="17">LinkedIn</option>
                                <option value="18">Referral</option>
                                <option value="14">Spark Lead</option>
                            </select>
                            <button class="btn btn-primary btn-sm" onclick="window.crmApp.sendBlogToBrevo('${postId}')">
                                📧 Send Now
                            </button>
                        </div>
                    </div>
                ` : ''}

                <div class="card" style="margin-top: 16px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                        <h3 style="margin: 0; font-size: 14px; color: #64748b;">👁️ Live Preview</h3>
                    </div>
                    <div id="blogPreview" style="border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; background: #fff; min-height: 100px;">
                        <h1 style="font-size: 28px; margin: 0 0 16px;">${post.title || 'Untitled'}</h1>
                        <div id="blogPreviewContent" style="line-height: 1.8; font-size: 15px;">${post.content || '<p style="color: #94a3b8; font-style: italic;">Start writing to see preview...</p>'}</div>
                    </div>
                </div>
            </div>
        `;

        // Initialize Quill rich text editor
        this.quillEditor = new Quill('#blogContent', {
            theme: 'snow',
            placeholder: 'Start writing your blog post...',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['blockquote', 'link', 'image'],
                    ['clean']
                ]
            }
        });

        // Live preview: update as user types
        const previewContent = document.getElementById('blogPreviewContent');
        const previewTitle = document.getElementById('blogPreview')?.querySelector('h1');
        const titleInput = document.getElementById('blogTitle');

        if (previewContent) {
            this.quillEditor.on('text-change', () => {
                previewContent.innerHTML = this.quillEditor.root.innerHTML;
            });
        }
        if (titleInput && previewTitle) {
            titleInput.addEventListener('input', () => {
                previewTitle.textContent = titleInput.value || 'Untitled';
            });
        }
    }

    async handleBlogImageUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const status = document.getElementById('imageUploadStatus');

        try {
            status.textContent = '⏳ Compressing & uploading...';
            status.style.color = '#7c3aed';

            const url = await window.crmDB.uploadBlogImage(file);

            // Insert image into Quill editor at cursor position
            if (this.quillEditor) {
                const range = this.quillEditor.getSelection(true);
                this.quillEditor.insertEmbed(range.index, 'image', url);
                this.quillEditor.setSelection(range.index + 1);
            }

            status.textContent = '✅ Image inserted!';
            status.style.color = '#059669';
            setTimeout(() => { status.textContent = ''; }, 3000);
        } catch (error) {
            status.textContent = '❌ Upload failed: ' + error.message;
            status.style.color = '#dc2626';
            console.error('Image upload error:', error);
        }

        // Reset file input so same file can be re-selected
        event.target.value = '';
    }

    async saveBlogPost(postId) {
        const title = document.getElementById('blogTitle').value.trim();
        const content = this.quillEditor ? this.quillEditor.root.innerHTML.trim() : '';
        const excerpt = document.getElementById('blogExcerpt').value.trim();
        const category = document.getElementById('blogCategory').value;

        // Quill's empty state is '<p><br></p>'
        const isEmpty = !content || content === '<p><br></p>';

        if (!title || isEmpty) {
            alert('Title and content are required.');
            return;
        }

        try {
            if (postId) {
                await window.crmDB.updateBlogPost(postId, { title, content, excerpt, category });
                await this.renderBlogEditor(postId);
            } else {
                const post = await window.crmDB.createBlogPost({ title, content, excerpt, category });
                window.crmRouter.navigate(`/blog/edit/${post.id}`);
            }
        } catch (error) {
            alert('Error saving post: ' + error.message);
        }
    }

    async publishBlogPost(postId) {
        if (!confirm('Publish this post? It will be visible on your website.')) return;
        try {
            await window.crmDB.publishBlogPost(postId);
            await this.renderBlogEditor(postId);
        } catch (error) {
            alert('Error publishing: ' + error.message);
        }
    }

    async unpublishBlogPost(postId) {
        try {
            await window.crmDB.unpublishBlogPost(postId);
            await this.renderBlogEditor(postId);
        } catch (error) {
            alert('Error unpublishing: ' + error.message);
        }
    }

    async deleteBlogPost(postId) {
        if (!confirm('Delete this post permanently?')) return;
        try {
            await window.crmDB.deleteBlogPost(postId);
            window.crmRouter.navigate('/blog');
        } catch (error) {
            alert('Error deleting: ' + error.message);
        }
    }

    async sendBlogToBrevo(postId) {
        const select = document.getElementById('brevoSendList');
        const selectedValue = select.value;

        // Determine list IDs
        let listIds;
        if (selectedValue === 'all') {
            listIds = [14, 15, 16, 17, 18, 19]; // All lists including HIMSS 26
        } else {
            listIds = [parseInt(selectedValue)];
        }

        const listName = select.options[select.selectedIndex].text;
        if (!confirm(`Send this blog post as an email to "${listName}"? This will email everyone on that list.`)) return;

        try {
            const post = await window.crmDB.getBlogPost(postId);
            const blogUrl = `https://marcoslacayobosche.com/blog/#${post.slug}`;

            const res = await fetch('/api/send-blog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: post.title,
                    content: post.content,
                    excerpt: post.excerpt,
                    listIds: listIds,
                    blogUrl: blogUrl
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            // Log activity for all contacts that have been synced to Brevo
            try {
                const owner = window.crmAuth.getOwner();
                const { data: contacts } = await window.crmDB.supabase
                    .from('contacts')
                    .select('id')
                    .eq('owner', owner)
                    .eq('brevo_synced', true);

                if (contacts && contacts.length > 0) {
                    const activityPromises = contacts.map(c =>
                        window.crmDB.logActivity(c.id, {
                            type: 'email',
                            outcome: 'sent',
                            notes: `Blog campaign sent: "${post.title}" (List: ${listName})`
                        }).catch(err => console.warn('Activity log failed for', c.id, err))
                    );
                    await Promise.all(activityPromises);
                }
            } catch (logErr) {
                console.warn('Campaign activity logging failed:', logErr);
            }

            alert(`✅ Blog emailed to "${listName}" successfully!`);
        } catch (error) {
            alert('Error sending to Brevo: ' + error.message);
        }
    }

    // ==========================================================================
    // Activity Log
    // ==========================================================================

    async renderActivityLog(preset = 'all', dateFrom = null, dateTo = null) {
        const main = document.getElementById('mainContent');
        main.innerHTML = window.CRMComponents.renderLoading();

        try {
            // Calculate date range from preset
            const today = new Date();
            let from = dateFrom;
            let to = dateTo;

            if (!from && !to) {
                switch (preset) {
                    case 'today':
                        from = today.toISOString().split('T')[0];
                        to = from;
                        break;
                    case 'week': {
                        const weekStart = new Date(today);
                        weekStart.setDate(today.getDate() - today.getDay());
                        from = weekStart.toISOString().split('T')[0];
                        to = today.toISOString().split('T')[0];
                        break;
                    }
                    case 'month':
                        from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                        to = today.toISOString().split('T')[0];
                        break;
                    case 'all':
                    default:
                        from = null;
                        to = null;
                        break;
                }
            }

            const activities = await window.crmDB.getAllActivities(from, to);
            main.innerHTML = window.CRMComponents.renderActivityLog(activities, {
                preset: (dateFrom || dateTo) ? 'custom' : preset,
                dateFrom: from || '',
                dateTo: to || ''
            });
        } catch (error) {
            main.innerHTML = window.CRMComponents.renderError(error.message);
        }
    }

    filterActivities(preset) {
        this.renderActivityLog(preset);
    }

    filterActivitiesCustom() {
        const from = document.getElementById('activityDateFrom')?.value;
        const to = document.getElementById('activityDateTo')?.value;
        if (from && to) {
            this.renderActivityLog('custom', from, to);
        }
    }
}

// Create global instance
window.crmApp = new CRMApp();
