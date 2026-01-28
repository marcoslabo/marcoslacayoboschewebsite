// ==========================================================================
// CRM Main Application
// ==========================================================================

class CRMApp {
    constructor() {
        this.filters = {
            search: '',
            source: '',
            status: ''
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
    }

    setupLoginHandler() {
        const form = document.getElementById('loginForm');
        const errorEl = document.getElementById('loginError');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = document.getElementById('passwordInput').value;

            errorEl.textContent = '';

            const result = await window.crmAuth.login(password);

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
            const data = await window.crmDB.getTodaysActions();
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
        } catch (error) {
            main.innerHTML = window.CRMComponents.renderError(error.message);
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

    editContact(id) {
        // For now, just alert - could open a modal later
        alert('Edit functionality coming soon!');
    }

    async syncToBrevo(id) {
        try {
            const contact = await window.crmDB.getContact(id);
            await window.crmDB.syncToBrevo(contact);
            await this.renderContactDetail(id);
            alert('Contact synced to Brevo!');
        } catch (error) {
            alert('Sync failed: ' + error.message);
        }
    }
}

// Create global instance
window.crmApp = new CRMApp();
