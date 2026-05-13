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

        // Weekly Todos (admin only)
        window.crmRouter.on('/weekly-todos', async () => {
            if (!window.crmAuth.isAdmin()) return window.crmRouter.navigate('/');
            await this.renderWeeklyTodos();
        });
    }

    // ==========================================================================
    // Event Listeners
    // ==========================================================================

    setupEventListeners() {
        // Prevent duplicate listeners if called multiple times
        if (this._listenersSetup) return;
        this._listenersSetup = true;

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
            const [data, stats, highIntent] = await Promise.all([
                window.crmDB.getTodaysActions(),
                window.crmDB.getDashboardStats(),
                window.crmDB.getHighIntentContacts()
            ]);
            data.stats = stats;
            data.highIntent = highIntent;
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
        if (this._savingQuickAdd) return;
        this._savingQuickAdd = true;

        const formData = new FormData(form);
        const name = formData.get('name').trim();
        const nameParts = name.split(' ');
        const firstName = nameParts[0];
        const lastName = nameParts.slice(1).join(' ') || '';

        try {
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

            // Read initial activity fields
            const activityType = document.getElementById('qaActivityType')?.value;
            const activityOutcome = document.getElementById('qaActivityOutcome')?.value;
            const activityNotes = document.getElementById('qaActivityNotes')?.value?.trim();
            const nextAction = document.getElementById('qaNextAction')?.value || 'None';
            const nextActionDate = document.getElementById('qaNextActionDate')?.value || null;
            const eventTag = document.getElementById('qaEventTag')?.value?.trim();

            // Set next action and event tag on contact if provided
            if (nextAction && nextAction !== 'None') contactData.next_action = nextAction;
            if (nextActionDate) contactData.next_action_date = nextActionDate;
            if (eventTag) contactData.event_tag = eventTag;

            const contact = await window.crmDB.createContact(contactData);

            // Log initial activity if selected
            if (activityType && contact?.id) {
                await window.crmDB.logActivity(contact.id, {
                    type: activityType,
                    outcome: activityOutcome || 'completed',
                    notes: activityNotes || null
                });
            }

            this.closeQuickAdd();

            // Navigate to the new contact's detail page
            if (contact?.id) {
                window.crmRouter.navigate(`/contact/${contact.id}`);
            } else {
                const path = window.crmRouter.getCurrentPath();
                if (path === '/') await this.renderDashboard();
                else if (path === '/contacts') await this.renderContacts();
            }
        } catch (error) {
            alert('Error creating contact: ' + error.message);
        } finally {
            this._savingQuickAdd = false;
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
            // Skip contacts already synced to Brevo to prevent duplicates
            const unsynced = withEmail.filter(c => !c.brevo_synced);
            const alreadySynced = withEmail.length - unsynced.length;

            if (withEmail.length === 0) {
                alert('No contacts with email addresses found for this tag.');
                return;
            }

            if (unsynced.length === 0) {
                alert(`All ${alreadySynced} contacts with email are already synced to Brevo.`);
                return;
            }

            let synced = 0;
            let failed = 0;

            for (const contact of unsynced) {
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

            const skippedMsg = alreadySynced > 0 ? ` (${alreadySynced} already synced, skipped)` : '';
            alert(`✅ Done! ${synced} contacts synced to Brevo.${skippedMsg} ${failed ? failed + ' failed.' : ''}`);
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

    async toggleHighIntent(id, value) {
        try {
            await window.crmDB.toggleHighIntent(id, value);
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
        const listId = listSelect ? parseInt(listSelect.value) : 15;
        const listName = listSelect ? listSelect.options[listSelect.selectedIndex].text : 'Met in Person';

        if (!confirm(`Push this contact to Brevo list "${listName}"?`)) return;

        try {
            const contact = await window.crmDB.getContact(id);

            // Guard: require email
            if (!contact.email) {
                alert('This contact has no email address. Add an email before pushing to Brevo.');
                return;
            }

            // Pass the selected list ID directly to the API — no tag-based routing
            await window.crmDB.syncToBrevo(contact, listId);

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

            // Always navigate to the contact detail to show updated status + timeline
            window.crmRouter.navigate(`/contact/${contactId}`);
        } catch (error) {
            alert('Error logging outcome: ' + error.message);
        }
    }

    // ==========================================================================
    // Spark — Price of Doing Nothing Management
    // ==========================================================================

    async renderSparkList() {
        const main = document.getElementById('mainContent');
        const allBriefs = await window.crmDB.getSparkBriefs();

        // Brand filter (persisted across sessions)
        const brandFilter = localStorage.getItem('spark_brand_filter') || 'all';
        const briefs = brandFilter === 'all'
            ? allBriefs
            : allBriefs.filter(b => (b.brand_slug || 'marcos') === brandFilter);

        const counts = {
            all: allBriefs.length,
            marcos: allBriefs.filter(b => (b.brand_slug || 'marcos') === 'marcos').length,
            vytalmed: allBriefs.filter(b => (b.brand_slug || 'marcos') === 'vytalmed').length
        };

        const statusGroups = {
            'New': briefs.filter(b => b.status === 'Draft'),
            'Shared': briefs.filter(b => b.status === 'Shared'),
            'Qualified': briefs.filter(b => b.status === 'Qualified'),
            'In Progress': briefs.filter(b => b.status === 'In Progress'),
            'Deployed': briefs.filter(b => ['Deployed', 'Measuring'].includes(b.status)),
            'Closed': briefs.filter(b => b.status === 'Closed Lost')
        };

        const filterPill = (key, label, count) => `
            <button onclick="window.crmApp.setSparkBrandFilter('${key}')"
                class="btn btn-sm ${brandFilter === key ? 'btn-primary' : 'btn-ghost'}"
                style="padding: 6px 12px;">${label} <span style="opacity:0.7;">${count}</span></button>
        `;

        main.innerHTML = `
            <div style="max-width: 900px; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <div>
                        <h2 style="margin: 0;">⚡ Spark — Submissions</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">"Price of Doing Nothing" calculator submissions across brands</p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <a href="/spark/new" target="_blank" class="btn btn-secondary btn-sm">Open Calculator ↗</a>
                    </div>
                </div>

                <div style="display:flex; gap:8px; align-items:center; margin-bottom:24px; flex-wrap:wrap;">
                    <span style="font-size:11px; color:#64748b; text-transform:uppercase; letter-spacing:0.5px; font-weight:600; margin-right:4px;">Brand</span>
                    ${filterPill('all', 'All', counts.all)}
                    ${filterPill('marcos', 'Marcos', counts.marcos)}
                    ${filterPill('vytalmed', 'VytalMed', counts.vytalmed)}
                </div>

                ${briefs.length === 0 ? `
                    <div class="card" style="text-align: center; padding: 48px;">
                        <p style="font-size: 18px; margin-bottom: 8px;">No submissions yet</p>
                        <p style="color: #64748b;">When prospects use the Price of Doing Nothing Calculator, their submissions will appear here.</p>
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

    setSparkBrandFilter(brand) {
        localStorage.setItem('spark_brand_filter', brand);
        this.renderSparkList();
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

        // Brand badge — shows for both brands so it's always clear which inbox the lead belongs to
        const brand = brief.brand_slug || 'marcos';
        const brandBadgeStyle = brand === 'vytalmed'
            ? 'background: #dbeafe; color: #1e3a8a;'
            : 'background: #ede9fe; color: #5b21b6;';
        const brandBadgeText = brand === 'vytalmed' ? 'VytalMed' : 'Marcos';

        return `
            <div class="card" style="margin-bottom: 10px; cursor: pointer;" onclick="window.crmRouter.navigate('/spark/${brief.id}')">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <div style="flex: 1;">
                        <div style="display: flex; gap: 8px; align-items: center; margin-bottom: 6px; flex-wrap: wrap;">
                            <span class="badge" style="${brandBadgeStyle} font-size: 11px;">${brandBadgeText}</span>
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

        // Pull the latest reply draft for this brief's contact (if any)
        const triage = brief.contact_id
            ? await window.crmDB.getLatestTriageForContact(brief.contact_id)
            : null;

        // Stash for inline handlers — we re-fetch on regenerate / mark sent
        this._currentSparkBrief = brief;
        this._currentTriage = triage;

        const annualCost = brief.annual_current_cost ? `$${Math.round(brief.annual_current_cost).toLocaleString()}` : '—';
        const savings = brief.annual_potential_savings ? `$${Math.round(brief.annual_potential_savings).toLocaleString()}` : '—';
        const statuses = ['Draft', 'Shared', 'Qualified', 'In Progress', 'Deployed', 'Measuring', 'Closed Lost'];
        const statusDescriptions = {
            'Draft':       'Reviewed internally — not yet sent to the prospect',
            'Shared':      'Brief sent to the prospect for review',
            'Qualified':   'Prospect confirmed the pain point and is interested',
            'In Progress': 'Active engagement / proposal in flight',
            'Deployed':    'Solution is live',
            'Measuring':   'Measuring ROI post-deployment',
            'Closed Lost': 'Opportunity did not move forward'
        };
        const pipeline = ['Draft', 'Shared', 'Qualified', 'In Progress', 'Deployed'];
        const currentStep = pipeline.indexOf(brief.status);

        const brand = brief.brand_slug || 'marcos';
        const brandBadgeStyle = brand === 'vytalmed' ? 'background: #dbeafe; color: #1e3a8a;' : 'background: #ede9fe; color: #5b21b6;';
        const brandBadgeText = brand === 'vytalmed' ? 'VytalMed' : 'Marcos';

        const contactInitial = brief.contact_name ? brief.contact_name.trim()[0].toUpperCase() : '?';

        main.innerHTML = `
            <div style="max-width: 800px; margin: 0 auto;">
                <a href="#/spark" class="btn btn-ghost btn-sm" style="margin-bottom: 16px;">← Back to Spark</a>

                <div class="card">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
                        <div>
                            <div style="margin-bottom: 6px;">
                                <span class="badge" style="${brandBadgeStyle} font-size: 11px;">${brandBadgeText}</span>
                            </div>
                            <h2 style="margin: 0 0 4px;">${brief.title || 'Untitled Brief'}</h2>
                            ${brief.company_name ? `<p style="color: #64748b; margin: 0; font-size: 14px;">${brief.company_name}</p>` : ''}
                        </div>
                        ${brief.share_id ? `<a href="/spark/s/?id=${brief.share_id}" target="_blank" class="btn btn-ghost btn-sm">View Share Link ↗</a>` : ''}
                    </div>

                    <!-- Submitter Contact Info -->
                    ${brief.contact_name || brief.contact_email ? `
                        <div style="display: flex; gap: 12px; align-items: center; padding: 14px; background: #f8fafc; border-radius: 8px; margin-bottom: 20px;">
                            <div style="width: 38px; height: 38px; background: #ede9fe; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #5b21b6; font-size: 15px; flex-shrink: 0;">
                                ${contactInitial}
                            </div>
                            <div>
                                <div style="font-weight: 600; font-size: 14px; color: #1e293b;">${brief.contact_name || '—'}</div>
                                ${brief.contact_email
                                    ? `<a href="mailto:${brief.contact_email}" style="font-size: 13px; color: #3b82f6; text-decoration: none;">${brief.contact_email}</a>`
                                    : ''}
                            </div>
                            <span style="margin-left: auto; font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px;">Form Submitter</span>
                        </div>
                    ` : `
                        <div style="padding: 12px 14px; background: #f8fafc; border-radius: 8px; margin-bottom: 20px; color: #94a3b8; font-size: 13px;">
                            No contact linked to this brief.
                        </div>
                    `}

                    <!-- Pipeline Progress -->
                    ${brief.status !== 'Closed Lost' ? `
                        <div style="display: flex; align-items: center; gap: 0; margin-bottom: 20px; overflow-x: auto;">
                            ${pipeline.map((s, i) => {
                                const done = i < currentStep;
                                const active = i === currentStep;
                                const bg = active ? '#5b21b6' : done ? '#ede9fe' : '#f1f5f9';
                                const color = active ? '#fff' : done ? '#5b21b6' : '#94a3b8';
                                const connector = i < pipeline.length - 1
                                    ? `<div style="flex: 1; height: 2px; background: ${done || active ? '#ede9fe' : '#f1f5f9'}; min-width: 16px;"></div>`
                                    : '';
                                return `
                                    <div style="display: flex; align-items: center; flex-shrink: 0;">
                                        <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                            <div style="width: 28px; height: 28px; border-radius: 50%; background: ${bg}; color: ${color}; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700;">${done ? '✓' : i + 1}</div>
                                            <span style="font-size: 10px; color: ${active ? '#5b21b6' : '#94a3b8'}; font-weight: ${active ? '600' : '400'}; white-space: nowrap;">${s}</span>
                                        </div>
                                    </div>
                                    ${connector}
                                `;
                            }).join('')}
                        </div>
                    ` : ''}

                    <!-- Status Selector -->
                    <div style="margin-bottom: 20px;">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <label style="font-size: 13px; color: #64748b;">Move to:</label>
                            <select id="sparkStatusSelect" class="filter-select" style="padding: 6px 12px;" onchange="window.crmApp.updateSparkStatusHint(this.value)">
                                ${statuses.map(s => `<option value="${s}" ${brief.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                            </select>
                            <button class="btn btn-sm btn-secondary" onclick="window.crmApp.updateSparkStatus('${brief.id}')">Update</button>
                        </div>
                        <p style="font-size: 12px; color: #94a3b8; margin: 6px 0 0 0;" id="sparkStatusHint">${statusDescriptions[brief.status] || ''}</p>
                    </div>

                    <!-- CNC Numbers -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; padding: 16px; background: #f8fafc; border-radius: 8px;">
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

                <!-- Reply Draft (Claude-drafted personalized response) -->
                <div class="card" id="sparkReplyCard">
                    ${this._renderSparkReplyCard(brief, triage)}
                </div>

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

    updateSparkStatusHint(status) {
        const descriptions = {
            'Draft':       'Reviewed internally — not yet sent to the prospect',
            'Shared':      'Brief sent to the prospect for review',
            'Qualified':   'Prospect confirmed the pain point and is interested',
            'In Progress': 'Active engagement / proposal in flight',
            'Deployed':    'Solution is live',
            'Measuring':   'Measuring ROI post-deployment',
            'Closed Lost': 'Opportunity did not move forward'
        };
        const hint = document.getElementById('sparkStatusHint');
        if (hint) hint.textContent = descriptions[status] || '';
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
    // Spark Reply Drafts (Claude-drafted first response)
    // ==========================================================================

    _renderSparkReplyCard(brief, triage) {
        const hasContact = !!brief.contact_id && !!brief.contact_email;
        const labelStyle = 'font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; margin-bottom: 4px; display:block;';
        const inputStyle = 'width: 100%; background: white; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; font: inherit; font-size: 13px;';
        const textareaStyle = inputStyle + ' min-height: 160px; resize: vertical; line-height: 1.5; font-family: ui-monospace, SFMono-Regular, monospace;';

        const header = `<h4 style="margin: 0 0 12px; color: #64748b; font-size: 13px; text-transform: uppercase;">Reply Draft</h4>`;

        if (!hasContact) {
            return `${header}<p style="color:#94a3b8; font-style:italic;">This brief has no contact email — add the contact first to draft a reply.</p>`;
        }

        if (!triage) {
            return `
                ${header}
                <p style="color:#64748b; margin-bottom:12px;">No reply drafted yet for ${this._esc(brief.contact_name || brief.contact_email)}.</p>
                <button class="btn btn-primary btn-sm" onclick="window.crmApp.draftSparkReply('${brief.id}')" id="draftReplyBtn">✨ Draft Reply with Claude</button>
                <p style="font-size:12px; color:#94a3b8; margin-top:8px;">Uses ${this._esc(brief.brand_slug || 'marcos')} brand voice + this brief's problem and ROI numbers.</p>
            `;
        }

        const sentBadge = triage.sent
            ? `<span class="badge" style="background:#d1fae5; color:#065f46; font-size:11px;">Sent ${new Date(triage.sent_at).toLocaleDateString()}</span>`
            : `<span class="badge" style="background:#fef3c7; color:#92400e; font-size:11px;">Drafted ${new Date(triage.created_at).toLocaleDateString()}</span>`;

        return `
            ${header}
            <div style="display:flex; gap:8px; align-items:center; margin-bottom:12px; flex-wrap:wrap;">
                ${sentBadge}
                ${triage.intent_score ? `<span class="badge" style="background:#e0e7ff; color:#3730a3; font-size:11px;">Intent ${triage.intent_score}/10</span>` : ''}
                ${triage.segment ? `<span class="badge" style="background:#f1f5f9; color:#475569; font-size:11px; text-transform:capitalize;">${this._esc(triage.segment)}</span>` : ''}
            </div>
            ${triage.intent_reasoning ? `<p style="font-size:13px; color:#64748b; font-style:italic; margin-bottom:12px;">${this._esc(triage.intent_reasoning)}</p>` : ''}

            <label style="${labelStyle}">To</label>
            <input type="text" style="${inputStyle}" value="${this._esc(brief.contact_email)}" readonly>

            <label style="${labelStyle} margin-top:10px;">Subject</label>
            <input type="text" id="replySubject" style="${inputStyle}" value="${this._esc(triage.draft_subject || '')}">

            <label style="${labelStyle} margin-top:10px;">Body</label>
            <textarea id="replyBody" style="${textareaStyle}">${this._esc(triage.draft_body || '')}</textarea>

            <div style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                <button class="btn btn-secondary btn-sm" onclick="window.crmApp.copySparkReply()">📋 Copy email</button>
                <button class="btn btn-ghost btn-sm" onclick="window.crmApp.draftSparkReply('${brief.id}')">🔄 Re-draft</button>
                ${triage.sent
                    ? ''
                    : `<button class="btn btn-primary btn-sm" onclick="window.crmApp.markSparkReplySent('${triage.id}', '${brief.id}')">✓ Mark as Sent</button>`}
            </div>
            <p id="replyStatus" style="font-size:12px; color:#94a3b8; margin-top:8px;">${triage.model || ''}</p>
        `;
    }

    async draftSparkReply(briefId) {
        const brief = this._currentSparkBrief;
        if (!brief || brief.id !== briefId) {
            // Fallback — re-fetch
            await this.renderSparkDetail(briefId);
            return this.draftSparkReply(briefId);
        }
        const btn = document.getElementById('draftReplyBtn');
        if (btn) { btn.disabled = true; btn.textContent = 'Drafting...'; }

        const payload = {
            brand: brief.brand_slug || 'marcos',
            contact: {
                first_name: (brief.contact_name || '').split(' ')[0] || '',
                last_name: (brief.contact_name || '').split(' ').slice(1).join(' ') || '',
                email: brief.contact_email,
                company_name: brief.company_name,
                company_industry: brief.company_industry,
                source: 'Website (Spark)'
            },
            spark_brief: {
                problem_clean: brief.problem_clean || brief.problem_raw,
                solution_level: brief.solution_level,
                suggested_approach: brief.suggested_approach,
                hours_per_week: brief.hours_per_week,
                people_involved: brief.people_involved
            }
        };

        try {
            const res = await fetch('/api/agents/inbound-triage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Draft failed');

            await window.crmDB.createTriage({
                contact_id: brief.contact_id,
                brand_slug: brief.brand_slug || 'marcos',
                segment: data.segment,
                intent_score: data.intent_score,
                intent_reasoning: data.intent_reasoning,
                draft_subject: data.draft_subject,
                draft_body: data.draft_body,
                model: data.model,
                used_spark_brief: true
            });

            await this.renderSparkDetail(briefId);
        } catch (e) {
            alert('Draft failed: ' + e.message);
            if (btn) { btn.disabled = false; btn.textContent = '✨ Draft Reply with Claude'; }
        }
    }

    async copySparkReply() {
        const subj = document.getElementById('replySubject')?.value || '';
        const body = document.getElementById('replyBody')?.value || '';
        const text = `Subject: ${subj}\n\n${body}`;
        await navigator.clipboard.writeText(text);
        const status = document.getElementById('replyStatus');
        if (status) {
            const orig = status.textContent;
            status.textContent = '✓ Copied to clipboard';
            status.style.color = '#10b981';
            setTimeout(() => { status.textContent = orig; status.style.color = '#94a3b8'; }, 1500);
        }
    }

    async markSparkReplySent(triageId, briefId) {
        const subjEl = document.getElementById('replySubject');
        const bodyEl = document.getElementById('replyBody');
        const updates = { sent: true, sent_at: new Date().toISOString() };
        if (subjEl) updates.draft_subject = subjEl.value;
        if (bodyEl) updates.draft_body = bodyEl.value;
        try {
            await window.crmDB.updateTriage(triageId, updates);
            // Move the brief to Shared if still in Draft (so it's not stuck in "New" forever)
            if (this._currentSparkBrief && this._currentSparkBrief.status === 'Draft') {
                await window.crmDB.updateBriefStatus(briefId, 'Shared');
            }
            await this.renderSparkDetail(briefId);
        } catch (e) {
            alert('Mark sent failed: ' + e.message);
        }
    }

    _esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

    async renderActivityLog(preset = 'all', dateFrom = null, dateTo = null, activityType = null) {
        const main = document.getElementById('mainContent');
        main.innerHTML = window.CRMComponents.renderLoading();

        try {
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

            const [activities, totalCounts] = await Promise.all([
                window.crmDB.getAllActivities(from, to, activityType),
                window.crmDB.getActivityCounts(from, to)
            ]);

            main.innerHTML = window.CRMComponents.renderActivityLog(activities, {
                preset: (dateFrom || dateTo) ? 'custom' : preset,
                dateFrom: from || '',
                dateTo: to || '',
                activityType: activityType || ''
            }, totalCounts);
        } catch (error) {
            main.innerHTML = window.CRMComponents.renderError(error.message);
        }
    }

    filterActivities(preset) {
        this.renderActivityLog(preset);
    }

    filterActivityLogByType(type) {
        window.crmRouter.navigate('/activity-log');
        setTimeout(() => this.renderActivityLog('all', null, null, type), 50);
    }

    filterActivitiesCustom() {
        const from = document.getElementById('activityDateFrom')?.value;
        const to = document.getElementById('activityDateTo')?.value;
        if (from && to) {
            this.renderActivityLog('custom', from, to);
        }
    }

    // ==========================================================================
    // Weekly Todos
    // ==========================================================================

    _getMondayISO(date) {
        const d = new Date(date);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        d.setDate(d.getDate() + diff);
        return d.toISOString().split('T')[0];
    }

    _formatWeekLabel(weekStartISO) {
        const start = new Date(weekStartISO + 'T00:00:00');
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        const opts = { month: 'short', day: 'numeric' };
        return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}, ${end.getFullYear()}`;
    }

    async renderWeeklyTodos() {
        const main = document.getElementById('mainContent');

        const brandFilter = localStorage.getItem('weekly_todos_brand_filter') || 'all';
        let weekStart = localStorage.getItem('weekly_todos_week_start');
        if (!weekStart) {
            weekStart = this._getMondayISO(new Date());
            localStorage.setItem('weekly_todos_week_start', weekStart);
        }

        const brand = brandFilter === 'all' ? null : brandFilter;
        const todos = await window.crmDB.getWeeklyTodos(weekStart, brand);

        const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
        const dayLabels = {
            monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
            thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
        };
        const todosByDay = {};
        days.forEach(d => todosByDay[d] = []);
        todos.forEach(t => {
            if (todosByDay[t.day_of_week]) todosByDay[t.day_of_week].push(t);
        });

        const doneCount = todos.filter(t => t.is_done).length;
        const totalCount = todos.length;
        const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

        const filterPill = (key, label) => `
            <button onclick="window.crmApp.setWeeklyTodosBrandFilter('${key}')"
                class="btn btn-sm ${brandFilter === key ? 'btn-primary' : 'btn-ghost'}"
                style="padding: 6px 12px;">${label}</button>
        `;

        const categoryColors = {
            record:  { bg: '#fef3c7', color: '#92400e' },
            edit:    { bg: '#dbeafe', color: '#1d4ed8' },
            publish: { bg: '#d1fae5', color: '#047857' },
            comment: { bg: '#ede9fe', color: '#6d28d9' },
            plan:    { bg: '#fce7f3', color: '#9d174d' },
            other:   { bg: '#f1f5f9', color: '#475569' }
        };

        const renderTodo = (todo) => {
            const cc = categoryColors[todo.category] || categoryColors.other;
            const bodyStyle = todo.is_done
                ? 'opacity: 0.5; text-decoration: line-through;'
                : '';
            return `
                <div style="padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px; margin-bottom: 8px; background: white;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        ${todo.category ? `<span class="badge" style="background:${cc.bg}; color:${cc.color}; font-size:10px; padding: 2px 6px;">${todo.category}</span>` : '<span></span>'}
                        <div style="display: flex; gap: 4px;">
                            <button onclick="window.crmApp.openWeeklyTodoModal('${todo.day_of_week}', '${todo.id}')"
                                class="btn btn-ghost" style="padding: 0 4px; font-size: 12px; min-width: auto; line-height: 1;" title="Edit">✏️</button>
                            <button onclick="window.crmApp.deleteWeeklyTodo('${todo.id}')"
                                class="btn btn-ghost" style="padding: 0 4px; font-size: 12px; color: #dc2626; min-width: auto; line-height: 1;" title="Delete">✕</button>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: flex-start;">
                        <input type="checkbox" ${todo.is_done ? 'checked' : ''}
                            onchange="window.crmApp.toggleWeeklyTodo('${todo.id}', this.checked)"
                            style="margin-top: 3px; cursor: pointer; flex-shrink: 0; width: 16px; height: 16px;">
                        <div style="flex: 1; min-width: 0; ${bodyStyle}">
                            <div style="font-size: 14px; font-weight: 600; color: #1e293b; line-height: 1.4; word-wrap: break-word;">${this._esc(todo.title)}</div>
                            ${todo.description ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px; line-height: 1.5; word-wrap: break-word;">${this._esc(todo.description)}</div>` : ''}
                        </div>
                    </div>
                </div>
            `;
        };

        const weekLabel = this._formatWeekLabel(weekStart);

        main.innerHTML = `
            <div style="max-width: 100%; margin: 0 auto;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h2 style="margin: 0;">🗓️ Weekly Todos</h2>
                        <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Content cadence and weekly cycle</p>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <button onclick="window.crmApp.applyWeeklyTemplate()" class="btn btn-secondary btn-sm">📋 Apply Weekly Template</button>
                        <button onclick="window.crmApp.openWeeklyTodoModal('monday')" class="btn btn-primary btn-sm">+ Add Todo</button>
                    </div>
                </div>

                <div style="display: flex; gap: 16px; align-items: center; margin-bottom: 12px; flex-wrap: wrap;">
                    <div style="display: flex; gap: 8px; align-items: center;">
                        <span style="font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Brand</span>
                        ${filterPill('all', 'All')}
                        ${filterPill('marcos', 'Marcos')}
                        ${filterPill('vytalmed', 'VytalMed')}
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; margin-left: auto;">
                        <button onclick="window.crmApp.navigateWeeklyTodos(-1)" class="btn btn-ghost btn-sm">◀ Prev</button>
                        <span style="font-weight: 600; min-width: 220px; text-align: center; font-size: 14px;">${weekLabel}</span>
                        <button onclick="window.crmApp.navigateWeeklyTodos(1)" class="btn btn-ghost btn-sm">Next ▶</button>
                        <button onclick="window.crmApp.navigateWeeklyTodos(0)" class="btn btn-ghost btn-sm" title="Jump to current week">Today</button>
                    </div>
                </div>

                <div style="margin-bottom: 16px; padding: 12px 16px; background: #f8fafc; border-radius: 8px; font-size: 13px; color: #475569; display: flex; align-items: center; gap: 12px;">
                    <strong>${doneCount} of ${totalCount}</strong> done this week
                    ${totalCount > 0 ? `
                        <div style="flex: 1; max-width: 300px; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #8b5cf6, #a78bfa); transition: width 0.3s;"></div>
                        </div>
                        <span style="color: #64748b;">${pct}%</span>
                    ` : ''}
                </div>

                <div style="display: grid; grid-template-columns: repeat(7, minmax(220px, 1fr)); gap: 12px; overflow-x: auto; padding-bottom: 8px;">
                    ${days.map(day => `
                        <div class="card" style="padding: 14px; min-height: 200px; min-width: 220px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                                <div style="font-weight: 700; font-size: 13px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">${dayLabels[day]}</div>
                                <button onclick="window.crmApp.openWeeklyTodoModal('${day}')" class="btn btn-ghost" style="padding: 2px 8px; font-size: 16px; min-width: auto; line-height: 1;" title="Add to ${dayLabels[day]}">+</button>
                            </div>
                            ${todosByDay[day].length === 0
                                ? `<div style="color: #cbd5e1; font-size: 13px; text-align: center; padding: 20px 0;">${day === 'saturday' ? '🌴 OFF' : 'No todos'}</div>`
                                : todosByDay[day].map(renderTodo).join('')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    setWeeklyTodosBrandFilter(brand) {
        localStorage.setItem('weekly_todos_brand_filter', brand);
        this.renderWeeklyTodos();
    }

    navigateWeeklyTodos(direction) {
        let current = localStorage.getItem('weekly_todos_week_start') || this._getMondayISO(new Date());
        if (direction === 0) {
            current = this._getMondayISO(new Date());
        } else {
            const d = new Date(current + 'T00:00:00');
            d.setDate(d.getDate() + (direction * 7));
            current = this._getMondayISO(d);
        }
        localStorage.setItem('weekly_todos_week_start', current);
        this.renderWeeklyTodos();
    }

    async applyWeeklyTemplate() {
        const weekStart = localStorage.getItem('weekly_todos_week_start') || this._getMondayISO(new Date());
        const brandFilter = localStorage.getItem('weekly_todos_brand_filter') || 'all';
        const brand = brandFilter === 'all' ? null : brandFilter;

        if (!confirm(`Apply weekly template to week of ${weekStart}? Existing duplicates will be skipped.`)) return;

        try {
            const result = await window.crmDB.applyWeeklyTemplate(weekStart, brand);
            alert(`Template applied: ${result.inserted} todos added, ${result.skipped} skipped (already existed).`);
            await this.renderWeeklyTodos();
        } catch (e) {
            alert('Failed to apply template: ' + e.message);
        }
    }

    async toggleWeeklyTodo(id, isDone) {
        try {
            await window.crmDB.updateTodo(id, { is_done: isDone });
            await this.renderWeeklyTodos();
        } catch (e) {
            alert('Failed to update: ' + e.message);
        }
    }

    async deleteWeeklyTodo(id) {
        if (!confirm('Delete this todo?')) return;
        try {
            await window.crmDB.deleteTodo(id);
            await this.renderWeeklyTodos();
        } catch (e) {
            alert('Failed to delete: ' + e.message);
        }
    }

    async openWeeklyTodoModal(day, id = null) {
        let todo = { day_of_week: day, title: '', description: '', category: 'other' };
        if (id) {
            const weekStart = localStorage.getItem('weekly_todos_week_start');
            const brandFilter = localStorage.getItem('weekly_todos_brand_filter') || 'all';
            const brand = brandFilter === 'all' ? null : brandFilter;
            const todos = await window.crmDB.getWeeklyTodos(weekStart, brand);
            const found = todos.find(t => t.id === id);
            if (found) todo = found;
        }

        const existing = document.getElementById('weeklyTodoModal');
        if (existing) existing.remove();

        const dayOpt = (val, label) =>
            `<option value="${val}" ${todo.day_of_week === val ? 'selected' : ''}>${label}</option>`;
        const catOpt = (val, label) =>
            `<option value="${val}" ${todo.category === val ? 'selected' : ''}>${label}</option>`;

        const modalHtml = `
            <div id="weeklyTodoModal" class="modal" style="display: flex;">
                <div class="modal-backdrop" onclick="window.crmApp.closeWeeklyTodoModal()"></div>
                <div class="modal-content" style="max-width: 500px;">
                    <div class="modal-header">
                        <h2>${id ? '✏️ Edit Todo' : '+ Add Todo'}</h2>
                        <button class="modal-close" onclick="window.crmApp.closeWeeklyTodoModal()">&times;</button>
                    </div>
                    <form id="weeklyTodoForm" onsubmit="event.preventDefault(); window.crmApp.saveWeeklyTodoModal();" style="padding: 20px;">
                        <input type="hidden" id="wtId" value="${id || ''}">
                        <div class="form-group">
                            <label>Title *</label>
                            <input type="text" id="wtTitle" required value="${this._esc(todo.title)}" placeholder="What needs to be done?">
                        </div>
                        <div class="form-group">
                            <label>Description</label>
                            <textarea id="wtDescription" rows="3" placeholder="Optional details">${this._esc(todo.description || '')}</textarea>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label>Day</label>
                                <select id="wtDay">
                                    ${dayOpt('monday','Monday')}
                                    ${dayOpt('tuesday','Tuesday')}
                                    ${dayOpt('wednesday','Wednesday')}
                                    ${dayOpt('thursday','Thursday')}
                                    ${dayOpt('friday','Friday')}
                                    ${dayOpt('saturday','Saturday')}
                                    ${dayOpt('sunday','Sunday')}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Category</label>
                                <select id="wtCategory">
                                    ${catOpt('record','Record')}
                                    ${catOpt('edit','Edit')}
                                    ${catOpt('publish','Publish')}
                                    ${catOpt('comment','Comment')}
                                    ${catOpt('plan','Plan')}
                                    ${catOpt('other','Other')}
                                </select>
                            </div>
                        </div>
                        <div class="form-actions" style="margin-top: 20px; display: flex; gap: 12px; justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary" onclick="window.crmApp.closeWeeklyTodoModal()">Cancel</button>
                            <button type="submit" class="btn btn-primary">${id ? 'Save Changes' : 'Add Todo'}</button>
                        </div>
                    </form>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        setTimeout(() => document.getElementById('wtTitle')?.focus(), 50);
    }

    closeWeeklyTodoModal() {
        const modal = document.getElementById('weeklyTodoModal');
        if (modal) modal.remove();
    }

    async saveWeeklyTodoModal() {
        const id = document.getElementById('wtId').value;
        const title = document.getElementById('wtTitle').value.trim();
        const description = document.getElementById('wtDescription').value.trim() || null;
        const day = document.getElementById('wtDay').value;
        const category = document.getElementById('wtCategory').value;

        if (!title) {
            alert('Title is required.');
            return;
        }

        const weekStart = localStorage.getItem('weekly_todos_week_start') || this._getMondayISO(new Date());
        const brandFilter = localStorage.getItem('weekly_todos_brand_filter') || 'all';
        const brand = brandFilter === 'vytalmed' ? 'vytalmed' : 'marcos';

        try {
            if (id) {
                await window.crmDB.updateTodo(id, {
                    title, description, day_of_week: day, category
                });
            } else {
                await window.crmDB.createTodo({
                    week_start: weekStart,
                    day_of_week: day,
                    title,
                    description,
                    category,
                    is_template: false,
                    order_index: 999,
                    brand_slug: brand
                });
            }
            this.closeWeeklyTodoModal();
            await this.renderWeeklyTodos();
        } catch (e) {
            alert('Failed to save: ' + e.message);
        }
    }
}

// Create global instance
window.crmApp = new CRMApp();
