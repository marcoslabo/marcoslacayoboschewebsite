// ==========================================================================
// Spark Application - Main Entry Point
// ==========================================================================

class SparkApp {
    constructor() {
        this.initialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        console.log('⚡ Initializing Spark...');

        // Initialize database client
        window.sparkDB.init();

        // Set up routes
        this.setupRoutes();

        // Set up event listeners
        this.setupEventListeners();

        // Initialize router
        window.sparkRouter.init();

        this.initialized = true;
        console.log('⚡ Spark ready!');
    }

    /**
     * Set up routes
     */
    setupRoutes() {
        window.sparkRouter
            .on('/', () => window.sparkRouter.navigate('/spark/new')) // Redirect to form
            .on('/new', () => this.showNewBriefForm())
            .on('/admin', () => this.showDashboard()) // Private dashboard
            .on('/brief/:id', (params) => this.showBrief(params.id))
            .on('/s/:shareId', (params) => this.showPublicBrief(params.shareId));
    }

    /**
     * Set up global event listeners
     */
    setupEventListeners() {
        // New Brief button in nav
        const newBriefBtn = document.getElementById('newBriefBtn');
        if (newBriefBtn) {
            newBriefBtn.addEventListener('click', () => {
                window.sparkRouter.navigate('/spark/new');
            });
        }
    }

    /**
     * Render content to main app container
     */
    render(html) {
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = html;
        }
    }

    // ==========================================================================
    // Route Handlers
    // ==========================================================================

    /**
     * Show Dashboard
     */
    async showDashboard() {
        try {
            const stats = await window.sparkDB.getStats();
            const briefs = await window.sparkDB.getBriefs();
            this.render(window.SparkComponents.renderDashboard(stats, briefs));
        } catch (error) {
            console.error('Failed to load dashboard:', error);
            this.render('<div class="empty-state"><h3>Error loading dashboard</h3></div>');
        }
    }

    /**
     * Show New Brief Form
     */
    async showNewBriefForm() {
        try {
            const companies = await window.sparkDB.getCompanies();
            const contacts = await window.sparkDB.getContacts();
            this.render(window.SparkComponents.renderNewBriefForm(companies, contacts));
            this.setupFormEventListeners();
        } catch (error) {
            console.error('Failed to load form:', error);
            this.render('<div class="empty-state"><h3>Error loading form</h3></div>');
        }
    }

    /**
     * Set up form event listeners
     */
    setupFormEventListeners() {
        // Company dropdown
        const companySelect = document.getElementById('companyId');
        if (companySelect) {
            companySelect.addEventListener('change', (e) => {
                const newCompanyFields = document.getElementById('newCompanyFields');
                if (newCompanyFields) {
                    newCompanyFields.style.display = e.target.value === 'new' ? 'block' : 'none';
                }
            });
        }

        // Contact dropdown
        const contactSelect = document.getElementById('contactId');
        if (contactSelect) {
            contactSelect.addEventListener('change', (e) => {
                const newContactFields = document.getElementById('newContactFields');
                if (newContactFields) {
                    newContactFields.style.display = e.target.value === 'new' ? 'block' : 'none';
                }
            });
        }

        // Estimate button
        const estimateBtn = document.getElementById('estimateBtn');
        if (estimateBtn) {
            estimateBtn.addEventListener('click', () => this.handleEstimate());
        }

        // Form submission
        const briefForm = document.getElementById('briefForm');
        if (briefForm) {
            briefForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleFormSubmit();
            });
        }
    }

    /**
     * Handle AI estimation
     */
    async handleEstimate() {
        const problemRaw = document.getElementById('problemRaw')?.value;
        const industry = document.getElementById('industry')?.value;
        const companySize = document.getElementById('companySize')?.value;

        if (!problemRaw) {
            alert('Please describe the problem first.');
            return;
        }

        try {
            document.body.insertAdjacentHTML('beforeend',
                window.SparkComponents.renderProcessingOverlay('Estimating effort...'));

            const estimation = await window.sparkAI.estimateROI(problemRaw, industry, companySize);

            document.getElementById('hoursPerWeek').value = estimation.hours_per_week;
            document.getElementById('peopleInvolved').value = estimation.people_involved;

            document.getElementById('processingOverlay')?.remove();

            alert(`Estimated: ${estimation.hours_per_week} hours/week with ${estimation.people_involved} people.\n\n${estimation.reasoning}`);
        } catch (error) {
            document.getElementById('processingOverlay')?.remove();
            console.error('Estimation failed:', error);
            alert('Failed to estimate. Please enter values manually.');
        }
    }

    /**
     * Handle form submission (simplified flow)
     */
    async handleFormSubmit() {
        const formData = this.getFormData();

        // Validate required fields
        if (!formData.first_name || !formData.last_name || !formData.email || !formData.company_name) {
            alert('Please fill in all contact information fields.');
            return;
        }

        if (!formData.problem_raw) {
            alert('Please describe the problem you\'re facing.');
            return;
        }

        try {
            // Show processing overlay
            document.body.insertAdjacentHTML('beforeend',
                window.SparkComponents.renderProcessingOverlay('Analyzing your challenge with AI...'));

            // Create company
            const company = await window.sparkDB.createCompany({
                name: formData.company_name
            });

            // Create contact
            const contact = await window.sparkDB.createContact({
                first_name: formData.first_name,
                last_name: formData.last_name,
                email: formData.email,
                company_id: company.id,
                source: 'Website (Spark)',
                is_lead: true
            });

            // Use AI to estimate effort from problem description
            let estimation = null;
            try {
                estimation = await window.sparkAI.estimateROI(formData.problem_raw);
            } catch (e) {
                console.log('AI estimation failed, using defaults:', e);
                estimation = { hours_per_week: 20, people_involved: 3 };
            }

            // Process with AI
            const aiResult = await window.sparkAI.processBrief({
                problem_raw: formData.problem_raw,
                hours_per_week: estimation.hours_per_week,
                people_involved: estimation.people_involved
            });

            // Create brief
            const brief = await window.sparkDB.createBrief({
                title: aiResult.title,
                company_id: company.id,
                contact_id: contact.id,
                problem_raw: formData.problem_raw,
                problem_clean: aiResult.problem_clean,
                hours_per_week: estimation.hours_per_week,
                people_involved: estimation.people_involved,
                hourly_rate: 50,
                improvement_percent: 80,
                solution_level: aiResult.solution_level,
                level_reasoning: aiResult.level_reasoning,
                suggested_approach: aiResult.suggested_approach,
                status: 'Draft',
                created_by: 'Website (Public)'
            });

            document.getElementById('processingOverlay')?.remove();

            // Navigate to brief view
            window.sparkRouter.navigate(`/spark/brief/${brief.id}`);

        } catch (error) {
            document.getElementById('processingOverlay')?.remove();
            console.error('Failed to create brief:', error);
            alert('Failed to create brief: ' + error.message);
        }
    }

    /**
     * Get form data
     */
    getFormData() {
        return {
            company_id: document.getElementById('companyId')?.value,
            company_name: document.getElementById('companyName')?.value,
            industry: document.getElementById('industry')?.value,
            company_size: document.getElementById('companySize')?.value,
            contact_id: document.getElementById('contactId')?.value,
            first_name: document.getElementById('firstName')?.value,
            last_name: document.getElementById('lastName')?.value,
            email: document.getElementById('email')?.value,
            job_title: document.getElementById('jobTitle')?.value,
            problem_raw: document.getElementById('problemRaw')?.value,
            current_process: document.getElementById('currentProcess')?.value,
            department: document.getElementById('department')?.value,
            hours_per_week: document.getElementById('hoursPerWeek')?.value,
            people_involved: document.getElementById('peopleInvolved')?.value,
            hourly_rate: document.getElementById('hourlyRate')?.value,
            improvement_percent: document.getElementById('improvementPercent')?.value
        };
    }

    /**
     * Show Brief
     */
    async showBrief(id) {
        try {
            const brief = await window.sparkDB.getBrief(id);
            if (brief) {
                this.render(window.SparkComponents.renderBriefView(brief));
            } else {
                this.render('<div class="empty-state"><h3>Brief not found</h3></div>');
            }
        } catch (error) {
            console.error('Failed to load brief:', error);
            this.render('<div class="empty-state"><h3>Error loading brief</h3></div>');
        }
    }

    /**
     * Show Public Brief (for shared links)
     */
    async showPublicBrief(shareId) {
        try {
            // Track view
            await window.sparkDB.incrementBriefViews(shareId);

            const brief = await window.sparkDB.getBriefByShareId(shareId);
            if (brief) {
                this.render(window.SparkComponents.renderPublicBrief(brief));
            } else {
                this.render('<div class="empty-state"><h3>Brief not found</h3></div>');
            }
        } catch (error) {
            console.error('Failed to load public brief:', error);
            this.render('<div class="empty-state"><h3>Error loading brief</h3></div>');
        }
    }

    /**
     * Edit Brief
     */
    editBrief(id) {
        // TODO: Implement edit modal or page
        alert('Edit feature coming soon!');
    }

    /**
     * Share Brief
     */
    async shareBrief(id) {
        try {
            console.log('Sharing brief:', id);
            const brief = await window.sparkDB.getBrief(id);
            console.log('Brief data:', brief);

            if (!brief) {
                alert('Could not load brief data.');
                return;
            }

            if (!brief.share_id) {
                alert('This brief does not have a share ID yet.');
                return;
            }

            const shareUrl = `${window.location.origin}/spark/s/?id=${brief.share_id}`;
            console.log('Share URL:', shareUrl);

            // Try to copy to clipboard
            let copied = false;
            try {
                if (navigator.clipboard && window.isSecureContext) {
                    await navigator.clipboard.writeText(shareUrl);
                    copied = true;
                }
            } catch (clipboardError) {
                console.log('Clipboard failed:', clipboardError);
            }

            if (copied) {
                alert(`Share link copied to clipboard!\n\n${shareUrl}`);
            } else {
                // Fallback: show prompt for manual copy
                prompt('Copy this share link:', shareUrl);
            }

            // Update status to Shared (don't block on this)
            try {
                await window.sparkDB.updateBrief(id, { status: 'Shared' });
            } catch (updateError) {
                console.log('Failed to update status:', updateError);
            }

        } catch (error) {
            console.error('Failed to share brief:', error);
            alert('Failed to generate share link: ' + error.message);
        }
    }
}

// Create global instance and initialize on DOM ready
window.sparkApp = new SparkApp();

document.addEventListener('DOMContentLoaded', () => {
    window.sparkApp.init();
});
