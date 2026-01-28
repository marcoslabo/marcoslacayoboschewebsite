// ==========================================================================
// UI Components for Spark
// ==========================================================================

const SparkComponents = {
    /**
     * Format currency
     */
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    },

    /**
     * Format date
     */
    formatDate(dateString) {
        return new Date(dateString).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    },

    /**
     * Get status badge class
     */
    getStatusClass(status) {
        const map = {
            'Draft': 'status-draft',
            'Shared': 'status-shared',
            'Qualified': 'status-qualified',
            'In Progress': 'status-in-progress',
            'Deployed': 'status-deployed',
            'Measuring': 'status-deployed',
            'Closed Lost': 'status-draft'
        };
        return map[status] || 'status-draft';
    },

    /**
     * Get level stars
     */
    getLevelStars(level) {
        if (level?.includes('Level 1')) return '★☆☆';
        if (level?.includes('Level 2')) return '★★☆';
        if (level?.includes('Level 3')) return '★★★';
        return '☆☆☆';
    },

    /**
     * Render Dashboard
     */
    renderDashboard(stats, briefs) {
        return `
            <div class="dashboard fade-in">
                <div class="dashboard-header">
                    <h1 class="dashboard-title">Dashboard</h1>
                    <p class="dashboard-subtitle">Your AI opportunity briefs</p>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalBriefs}</div>
                        <div class="stat-label">Total Briefs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.sharedBriefs}</div>
                        <div class="stat-label">Shared</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${this.formatCurrency(stats.totalPotentialROI)}</div>
                        <div class="stat-label">Potential ROI</div>
                    </div>
                </div>

                <div class="briefs-section-header">
                    <h2 class="briefs-section-title">Recent Briefs</h2>
                </div>

                ${briefs.length === 0 ? this.renderEmptyState() : this.renderBriefsList(briefs)}
            </div>
        `;
    },

    /**
     * Render Empty State
     */
    renderEmptyState() {
        return `
            <div class="empty-state">
                <div class="empty-state-icon">⚡</div>
                <h3 class="empty-state-title">No briefs yet</h3>
                <p class="empty-state-text">Create your first AI opportunity brief to get started.</p>
                <button class="btn btn-primary btn-lg" onclick="window.sparkRouter.navigate('/spark/new')">
                    Create Brief
                </button>
            </div>
        `;
    },

    /**
     * Render Briefs List
     */
    renderBriefsList(briefs) {
        return `
            <div class="briefs-list">
                ${briefs.map(brief => this.renderBriefCard(brief)).join('')}
            </div>
        `;
    },

    /**
     * Render Brief Card
     */
    renderBriefCard(brief) {
        return `
            <a href="#" class="brief-card" onclick="event.preventDefault(); window.sparkRouter.navigate('/spark/brief/${brief.id}')">
                <div class="brief-card-header">
                    <div>
                        <div class="brief-company">${brief.company_name || 'No Company'}</div>
                        <h3 class="brief-title">${brief.title || 'Untitled Brief'}</h3>
                    </div>
                    <span class="status-badge ${this.getStatusClass(brief.status)}">${brief.status}</span>
                </div>
                <div class="brief-meta">
                    <span class="brief-meta-item">
                        💰 <span class="brief-meta-value accent">${this.formatCurrency(brief.annual_potential_savings || 0)}</span>
                    </span>
                    <span class="brief-meta-item">
                        ⚡ <span class="brief-meta-value">${brief.solution_level?.replace('Level ', 'L') || 'Not classified'}</span>
                    </span>
                    <span class="brief-meta-item">
                        📅 <span class="brief-meta-value">${this.formatDate(brief.created_at)}</span>
                    </span>
                    ${brief.share_link_views > 0 ? `
                        <span class="brief-meta-item">
                            👁️ <span class="brief-meta-value">${brief.share_link_views} views</span>
                        </span>
                    ` : ''}
                </div>
            </a>
        `;
    },

    /**
     * Render New Brief Form (Simplified for lead capture)
     */
    renderNewBriefForm(companies = [], contacts = []) {
        return `
            <div class="form-page fade-in">
                <div class="form-header">
                    <a href="#" class="back-link" onclick="event.preventDefault(); window.sparkRouter.navigate('/spark/admin')">
                        ← Back to Dashboard
                    </a>
                    <h1 class="form-title">New AI Opportunity Brief</h1>
                    <p class="form-subtitle">Tell us about your challenge and we'll show you the potential ROI.</p>
                </div>

                <form id="briefForm" class="form-card">
                    <!-- Contact Information -->
                    <div class="form-section">
                        <h3 class="form-section-title">Your Information</h3>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">First Name *</label>
                                <input type="text" class="form-input" id="firstName" name="first_name" required placeholder="John">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Last Name *</label>
                                <input type="text" class="form-input" id="lastName" name="last_name" required placeholder="Smith">
                            </div>
                        </div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Email *</label>
                                <input type="email" class="form-input" id="email" name="email" required placeholder="john@company.com">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Company *</label>
                                <input type="text" class="form-input" id="companyName" name="company_name" required placeholder="Acme Healthcare">
                            </div>
                        </div>
                    </div>

                    <!-- Problem Description -->
                    <div class="form-section">
                        <h3 class="form-section-title">The Challenge</h3>
                        <div class="form-group full-width">
                            <label class="form-label">Describe the problem you're facing *</label>
                            <textarea class="form-textarea large" id="problemRaw" name="problem_raw" required placeholder="Tell us about the challenge you're facing:

• What's the problem or bottleneck?
• How are you handling it today?
• How many people are involved?
• How much time does it take?

Example: 'We receive hundreds of faxes daily with patient orders. Our team of 5 nurses spends about 3 hours each day manually typing this data into Epic EMR. It's slow, error-prone, and everyone hates it.'"></textarea>
                            <span class="form-hint">Don't worry about formatting – our AI will analyze your description and calculate the potential ROI.</span>
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="form-actions">
                        <button type="button" class="btn btn-secondary" onclick="window.sparkRouter.navigate('/spark/admin')">
                            Cancel
                        </button>
                        <button type="submit" class="btn btn-primary btn-lg">
                            ⚡ Calculate My ROI
                        </button>
                    </div>
                </form>
            </div>
        `;
    },


    /**
     * Render Brief View
     */
    renderBriefView(brief) {
        const hoursPerWeek = brief.hours_per_week || 0;
        const people = brief.people_involved || 1;
        const rate = brief.hourly_rate || 50;
        const improvement = brief.improvement_percent || 80;
        const annualCost = hoursPerWeek * people * rate * 52;
        const annualSavings = annualCost * (improvement / 100);

        return `
            <div class="form-page fade-in">
                <div class="brief-view-header">
                    <div>
                        <a href="#" class="back-link" onclick="event.preventDefault(); window.sparkRouter.navigate('/spark/admin')">
                            ← Back to Dashboard
                        </a>
                        <h1 class="form-title">${brief.title || 'Untitled Brief'}</h1>
                        <div class="brief-view-meta">
                            <span class="status-badge ${this.getStatusClass(brief.status)}">${brief.status}</span>
                            <span>${brief.company_name || 'No Company'}</span>
                            <span>${this.formatDate(brief.created_at)}</span>
                        </div>
                    </div>
                    <div class="brief-view-actions">
                        <button class="btn btn-secondary" onclick="window.sparkApp.editBrief('${brief.id}')">
                            ✏️ Edit
                        </button>
                        <button class="btn btn-primary" onclick="window.sparkApp.shareBrief('${brief.id}')">
                            📤 Share
                        </button>
                    </div>
                </div>

                <!-- ROI Card -->
                <div class="roi-card">
                    <div class="roi-label">Potential Annual Value</div>
                    <div class="roi-value">${this.formatCurrency(annualSavings)}</div>
                    <div class="roi-breakdown">
                        ${hoursPerWeek} hrs × ${people} people × $${rate}/hr × ${improvement}% improvement
                    </div>
                </div>

                <!-- Problem -->
                <div class="content-section">
                    <h3 class="content-section-title">The Problem</h3>
                    <div class="content-section-body">
                        ${brief.problem_clean || brief.problem_raw || 'No problem description'}
                    </div>
                </div>

                ${brief.current_process ? `
                    <div class="content-section">
                        <h3 class="content-section-title">Current Process</h3>
                        <div class="content-section-body">${brief.current_process}</div>
                    </div>
                ` : ''}

                <!-- Level -->
                ${brief.solution_level ? `
                    <div class="level-card">
                        <div class="level-header">
                            <span class="level-stars">${this.getLevelStars(brief.solution_level)}</span>
                            <span class="level-name">${brief.solution_level}</span>
                        </div>
                        ${brief.level_reasoning ? `
                            <div class="level-reasoning">${brief.level_reasoning}</div>
                        ` : ''}
                    </div>
                ` : ''}

                <!-- Approach -->
                ${brief.suggested_approach ? `
                    <div class="content-section">
                        <h3 class="content-section-title">Suggested Approach</h3>
                        <div class="content-section-body">${brief.suggested_approach}</div>
                    </div>
                ` : ''}

                <!-- Share Info -->
                ${brief.share_id ? `
                    <div class="content-section">
                        <h3 class="content-section-title">Share Link</h3>
                        <div class="content-section-body">
                            <code>${window.location.origin}/spark/s/${brief.share_id}</code>
                            ${brief.share_link_views > 0 ? `<br><small>Viewed ${brief.share_link_views} times</small>` : ''}
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    },

    /**
     * Render Processing Overlay
     */
    renderProcessingOverlay(message = 'Processing with AI...') {
        return `
            <div class="processing-overlay" id="processingOverlay">
                <div class="processing-card">
                    <div class="processing-icon">⚡</div>
                    <p>${message}</p>
                </div>
            </div>
        `;
    },

    /**
     * Render Public Brief (for prospects)
     */
    renderPublicBrief(brief) {
        const annualSavings = brief.annual_potential_savings || 0;
        const { CALENDAR_LINK } = window.SPARK_CONFIG;

        return `
            <div class="form-page fade-in" style="padding-top: var(--space-8);">
                <div style="text-align: center; margin-bottom: var(--space-8);">
                    <div style="font-size: 2rem; margin-bottom: var(--space-2);">⚡</div>
                    <h1 style="font-size: var(--text-2xl); font-weight: var(--font-bold); margin-bottom: var(--space-1);">
                        AI Opportunity Assessment
                    </h1>
                    <p style="color: var(--color-text-muted);">
                        Prepared for ${brief.company_name || 'Your Organization'}
                    </p>
                </div>

                <!-- Problem -->
                <div class="content-section">
                    <h3 class="content-section-title">The Challenge</h3>
                    <div class="content-section-body">
                        ${brief.problem_clean || brief.problem_raw || 'No problem description'}
                    </div>
                </div>

                <!-- ROI Card -->
                <div class="roi-card">
                    <div class="roi-label">Estimated Annual Value</div>
                    <div class="roi-value">${this.formatCurrency(annualSavings)}</div>
                    <div class="roi-breakdown">potential savings</div>
                </div>

                <!-- Level & Approach -->
                ${brief.solution_level ? `
                    <div class="level-card">
                        <div class="level-header">
                            <span class="level-stars">${this.getLevelStars(brief.solution_level)}</span>
                            <span class="level-name">${brief.solution_level}</span>
                        </div>
                    </div>
                ` : ''}

                ${brief.suggested_approach ? `
                    <div class="content-section">
                        <h3 class="content-section-title">Solution Approach</h3>
                        <div class="content-section-body">${brief.suggested_approach}</div>
                    </div>
                ` : ''}

                <!-- CTA -->
                <div style="text-align: center; padding: var(--space-8) 0;">
                    <h3 style="font-size: var(--text-xl); margin-bottom: var(--space-4);">
                        Ready to move forward?
                    </h3>
                    <a href="${CALENDAR_LINK}" class="btn btn-primary btn-lg" target="_blank">
                        Book a Call with Marcos →
                    </a>
                </div>

                <div style="text-align: center; padding: var(--space-4); color: var(--color-text-light); font-size: var(--text-sm);">
                    Spark by Marcos Bosche | Powered by Nymbl
                </div>
            </div>
        `;
    }
};

// Make components globally available
window.SparkComponents = SparkComponents;
