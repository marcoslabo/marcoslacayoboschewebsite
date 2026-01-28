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

    openCsvImport() {
        document.getElementById('csvImportModal').style.display = 'flex';
        this.resetCsvImport();
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
        if (file && file.name.endsWith('.csv')) {
            this.parseCsvFile(file);
        }
    }

    parseCsvFile(file) {
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
        const normalizedHeaders = headers.map(h => h.toLowerCase().replace(/[^a-z]/g, ''));

        // Auto-detect common column names
        const patterns = {
            email: ['email', 'emailaddress', 'mail', 'workemail', 'personalemail'],
            first_name: ['firstname', 'first', 'fname', 'givenname'],
            last_name: ['lastname', 'last', 'lname', 'surname', 'familyname'],
            company: ['company', 'companyname', 'organization', 'org', 'employer'],
            phone: ['phone', 'phonenumber', 'mobile', 'cell', 'telephone'],
            job_title: ['title', 'jobtitle', 'position', 'role'],
            linkedin_url: ['linkedin', 'linkedinurl', 'linkedinprofile']
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

        // Show progress
        document.getElementById('csvStep2').style.display = 'none';
        document.getElementById('csvStep3').style.display = 'block';

        let imported = 0;
        let skipped = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const email = row[columnMap.email];

            if (!email || !email.includes('@')) {
                skipped++;
                continue;
            }

            const contact = {
                first_name: row[columnMap.first_name] || '',
                last_name: row[columnMap.last_name] || '',
                email: email,
                phone: row[columnMap.phone] || null,
                job_title: row[columnMap.job_title] || null,
                linkedin_url: row[columnMap.linkedin_url] || null,
                source: source,
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
                await window.crmDB.createContact(contact);
                imported++;
            } catch (e) {
                console.error('Error importing contact:', e);
                skipped++;
            }

            // Update progress
            const progress = Math.round(((i + 1) / rows.length) * 100);
            document.getElementById('csvProgressBar').style.width = progress + '%';
            document.getElementById('csvProgressText').textContent = `Importing... ${i + 1} of ${rows.length}`;
        }

        // Show complete
        document.getElementById('csvStep3').style.display = 'none';
        document.getElementById('csvStep4').style.display = 'block';
        document.getElementById('csvCompleteText').textContent = `Imported ${imported} contacts!${skipped > 0 ? ` (${skipped} skipped)` : ''}`;
    }
}

// Create global instance
window.crmApp = new CRMApp();
